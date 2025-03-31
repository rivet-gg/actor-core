import type { AnyActorInstance } from "./instance";
import type { ActorDriver } from "./driver";
import { KEYS } from "./keys";
import { logger } from "./log";

interface ScheduleState {
	// Sorted by timestamp asc
	events: ScheduleIndexEvent[];
}

interface ScheduleIndexEvent {
	timestamp: number;
	eventId: string;
}

interface ScheduleEvent {
	timestamp: number;
	createdAt: number;
	fn: string;
	args: unknown[];
}

export interface Alarm {
	id: string;
	createdAt: number;
	triggersAt: number;
	fn: string;
	args: unknown[];
}

export class Schedule {
	#actor: AnyActorInstance;
	#driver: ActorDriver;

	constructor(actor: AnyActorInstance, driver: ActorDriver) {
		this.#actor = actor;
		this.#driver = driver;
	}

	async after(duration: number, fn: string, ...args: unknown[]): Promise<string> {
		return this.#scheduleEvent(Date.now() + duration, fn, args);
	}

	async at(timestamp: number, fn: string, ...args: unknown[]): Promise<string> {
		return this.#scheduleEvent(timestamp, fn, args);
	}

	async get(alarmId: string): Promise<Alarm | null> {
		const event = await this.#driver.kvGet(
			this.#actor.id,
			KEYS.SCHEDULE.event(alarmId)
		) as ScheduleEvent | undefined;

		if (!event) return null;

		return {
			id: alarmId,
			createdAt: event.createdAt,
			triggersAt: event.timestamp,
			fn: event.fn,
			args: event.args
		};
	}

	async list(): Promise<readonly Alarm[]> {
		const schedule: ScheduleState = ((await this.#driver.kvGet(
			this.#actor.id,
			KEYS.SCHEDULE.SCHEDULE
		)) as ScheduleState) ?? { events: [] };

		const alarms: Alarm[] = [];
		for (const event of schedule.events) {
			const scheduleEvent = await this.#driver.kvGet(
				this.#actor.id,
				KEYS.SCHEDULE.event(event.eventId)
			) as ScheduleEvent;

			if (scheduleEvent) {
				alarms.push(Object.freeze({
					id: event.eventId,
					createdAt: scheduleEvent.createdAt,
					triggersAt: scheduleEvent.timestamp,
					fn: scheduleEvent.fn,
					args: scheduleEvent.args
				}));
			}
		}

		return Object.freeze(alarms);
	}

	async cancel(alarmId: string): Promise<void> {
		// Get the schedule index
		const schedule: ScheduleState = ((await this.#driver.kvGet(
			this.#actor.id,
			KEYS.SCHEDULE.SCHEDULE
		)) as ScheduleState) ?? { events: [] };

		// Find and remove the event from the index
		const eventIndex = schedule.events.findIndex(x => x.eventId === alarmId);
		if (eventIndex === -1) return;

		const [removedEvent] = schedule.events.splice(eventIndex, 1);

		// Delete the event data
		await this.#driver.kvDelete(
			this.#actor.id,
			KEYS.SCHEDULE.event(alarmId)
		);

		// Update the schedule index
		await this.#driver.kvPut(
			this.#actor.id,
			KEYS.SCHEDULE.SCHEDULE,
			schedule
		);

		// If we removed the first event (next to execute), update the alarm
		if (eventIndex === 0) {
			if (schedule.events.length > 0) {
				// Set alarm to next event
				await this.#driver.setAlarm(this.#actor, schedule.events[0].timestamp);
			} else {
				// No more events, delete the alarm
				await this.#driver.deleteAlarm(this.#actor);
			}
		}
	}

	async #scheduleEvent(
		timestamp: number,
		fn: string,
		args: unknown[],
	): Promise<string> {
		// Save event
		const eventId = crypto.randomUUID();
		await this.#driver.kvPut(
			this.#actor.id,
			KEYS.SCHEDULE.event(eventId),
			{
				timestamp,
				createdAt: Date.now(),
				fn,
				args,
			},
		);

		// TODO: Clean this up to use list instead of get
		// Read index
		const schedule: ScheduleState = ((await this.#driver.kvGet(
			this.#actor.id,
			KEYS.SCHEDULE.SCHEDULE,
		)) as ScheduleState) ?? {
			events: [],
		};

		// Insert event in to index
		const newEvent: ScheduleIndexEvent = { timestamp, eventId };
		const insertIndex = schedule.events.findIndex(
			(x) => x.timestamp > newEvent.timestamp,
		);
		if (insertIndex === -1) {
			schedule.events.push(newEvent);
		} else {
			schedule.events.splice(insertIndex, 0, newEvent);
		}

		// Write new index
		await this.#driver.kvPut(this.#actor.id, KEYS.SCHEDULE.SCHEDULE, schedule);

		// Update alarm if:
		// - this is the newest event (i.e. at beginning of array) or
		// - this is the only event (i.e. the only event in the array)
		if (insertIndex === 0 || schedule.events.length === 1) {
			await this.#driver.setAlarm(this.#actor, newEvent.timestamp);
		}

		return eventId;
	}

	async __onAlarm() {
		const now = Date.now();

		// Read index
		const scheduleIndex: ScheduleState = ((await this.#driver.kvGet(
			this.#actor.id,
			KEYS.SCHEDULE.SCHEDULE,
		)) as ScheduleState | undefined) ?? { events: [] };

		// Remove events from schedule
		const runIndex = scheduleIndex.events.findIndex((x) => x.timestamp < now);
		const scheduleIndexEvents = scheduleIndex.events.splice(0, runIndex + 1);

		// Find events to trigger
		const eventKeys = scheduleIndexEvents.map((x) =>
			KEYS.SCHEDULE.event(x.eventId),
		);
		const scheduleEvents = (await this.#driver.kvGetBatch(
			this.#actor.id,
			eventKeys,
		)) as ScheduleEvent[];
		await this.#driver.kvDeleteBatch(this.#actor.id, eventKeys);

		// Write new schedule
		await this.#driver.kvPut(
			this.#actor.id,
			KEYS.SCHEDULE.SCHEDULE,
			scheduleIndex,
		);

		// Set alarm for next event
		if (scheduleIndex.events.length > 0) {
			await this.#driver.setAlarm(
				this.#actor,
				scheduleIndex.events[0].timestamp,
			);
		}

		// Iterate by event key in order to ensure we call the events in order
		for (const event of scheduleEvents) {
			try {
				// Look up function
				const fn: unknown = this.#actor[event.fn as keyof AnyActorInstance];
				if (!fn) throw new Error(`Missing function for alarm ${event.fn}`);
				if (typeof fn !== "function")
					throw new Error(
						`Alarm function lookup for ${event.fn} returned ${typeof fn}`,
					);

				// Call function
				try {
					await fn.apply(this.#actor, event.args);
				} catch (error) {
					await this.#driver.kvPut(
						this.#actor.id,
						KEYS.SCHEDULE.alarmError(event.fn),
						{
							error: error,
							timestamp: now,
						},
					);
				}
			} catch (err) {
				logger().error("failed to run scheduled event", {
					fn: event.fn,
					error: `${err}`,
				});

				// Write internal error
				await this.#driver.kvPut(
					this.#actor.id,
					KEYS.SCHEDULE.alarmError(event.fn),
					{
						error: `${err}`,
						timestamp: now,
					},
				);
			}
		}
	}
}
