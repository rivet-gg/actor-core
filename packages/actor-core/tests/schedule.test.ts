import { describe, it, expect, assert, vi } from "vitest";
import { actor, setup } from "@/mod";
import { setupTest } from "@/test/mod";
import type { Alarm } from "@/actor/schedule";

describe("Actor scheduling", () => {
  // Increase timeout for scheduling tests
  it("should schedule and execute events after specified duration", async () => {
    const events: string[] = [];

    const testActor = actor({
      state: {
        events: [] as string[],
        done: false
      },
      actions: {
        scheduleEvents: async (c) => {
          await c.schedule.after(100, "recordEvent", "event1");
          await c.schedule.after(200, "recordEvent", "event2");
        },
        recordEvent: (c, event: string) => {
          events.push(event);
          if (events.length === 2) {
            c.state.done = true;
          }
        },
        isDone: (c) => c.state.done
      }
    });

    const app = setup({
      actors: { testActor }
    });

    const { client } = await setupTest(app);
    const instance = await client.testActor.get();

    await instance.scheduleEvents();

    // Advance time to trigger both events
    await vi.advanceTimersByTimeAsync(250);

    expect(events).toEqual(["event1", "event2"]);
  });

  it("should schedule events at specific timestamps", async () => {
    const events: string[] = [];

    const testActor = actor({
      state: {
        events: [] as string[],
        done: false
      },
      actions: {
        scheduleEvents: async (c) => {
          const now = Date.now();
          await c.schedule.at(now + 100, "recordEvent", "event1");
          await c.schedule.at(now + 200, "recordEvent", "event2");
        },
        recordEvent: (c, event: string) => {
          events.push(event);
          if (events.length === 2) {
            c.state.done = true;
          }
        },
        isDone: (c) => c.state.done
      }
    });

    const app = setup({
      actors: { testActor }
    });

    const { client } = await setupTest(app);
    const instance = await client.testActor.get();

    await instance.scheduleEvents();

    // Advance time to trigger both events
    await vi.advanceTimersByTimeAsync(250);

    expect(events).toEqual(["event1", "event2"]);
  });

  it("should allow canceling scheduled events", async () => {
    const events: string[] = [];
    let eventId2: string;

    const testActor = actor({
      state: {
        events: [] as string[],
        done: false
      },
      actions: {
        scheduleEvents: async (c) => {
          await c.schedule.after(100, "recordEvent", "event1");
          eventId2 = await c.schedule.after(200, "recordEvent", "event2");
        },
        cancelEvent: async (c) => {
          await c.schedule.cancel(eventId2);
        },
        recordEvent: (c, event: string) => {
          events.push(event);
        },
        isDone: (c) => c.state.done
      }
    });

    const app = setup({
      actors: { testActor }
    });

    const { client } = await setupTest(app);
    const instance = await client.testActor.get();

    await instance.scheduleEvents();
    await instance.cancelEvent();

    // Advance time to trigger all events except the cancelled one
    await vi.advanceTimersByTimeAsync(700);

    expect(events).toEqual(["event1"]);
  });

  it("should list all scheduled events", async () => {
    const testActor = actor({
      state: {
        scheduledEvents: null as readonly Alarm[] | null
      },
      actions: {
        scheduleAndList: async (c) => {
          await c.schedule.after(1000, "doSomething");
          await c.schedule.after(2000, "doSomething");
          c.state.scheduledEvents = await c.schedule.list();
        },
        getScheduledEvents: (c) => c.state.scheduledEvents,
        doSomething: () => { }
      }
    });

    const app = setup({
      actors: { testActor }
    });

    const { client } = await setupTest(app);
    const instance = await client.testActor.get();

    const now = Date.now();
    await instance.scheduleAndList();
    const scheduledEvents = await instance.getScheduledEvents();

    expect(scheduledEvents).toHaveLength(2);
    assert(scheduledEvents, "scheduledEvents should not be null");
    expect(scheduledEvents[0].triggersAt).toBeGreaterThan(now);
    expect(scheduledEvents[1].triggersAt).toBeGreaterThan(scheduledEvents[0].triggersAt);
  });

  it("should get details of a specific scheduled event", async () => {
    const testActor = actor({
      state: {
        eventDetails: null as Alarm | null,
        eventId: "" as string
      },
      actions: {
        scheduleAndGet: async (c) => {
          c.state.eventId = await c.schedule.after(1000, "doSomething", "arg1", 42);
          const details = await c.schedule.get(c.state.eventId);
          c.state.eventDetails = details || null;
        },
        getEventDetails: (c) => ({
          details: c.state.eventDetails,
          id: c.state.eventId
        }),
        doSomething: () => { }
      }
    });

    const app = setup({
      actors: { testActor }
    });

    const { client } = await setupTest(app);
    const instance = await client.testActor.get();

    const now = Date.now();
    await instance.scheduleAndGet();
    const { details: eventDetails, id: eventId } = await instance.getEventDetails();

    expect(eventDetails).toBeDefined();
    expect(eventDetails?.id).toBe(eventId);
    expect(eventDetails?.fn).toBe("doSomething");
    expect(eventDetails?.args).toEqual(["arg1", 42]);
    expect(eventDetails?.triggersAt).toBeGreaterThan(now);
    expect(eventDetails?.createdAt).toBeLessThanOrEqual(now);
  });
}); 