import { MAX_CONN_PARAMS_SIZE } from "@/common//network";

export class WorkerClientError extends Error {}

export class InternalError extends WorkerClientError {}

export class ManagerError extends WorkerClientError {
	constructor(error: string, opts?: ErrorOptions) {
		super(`Manager error: ${error}`, opts);
	}
}

export class ConnParamsTooLong extends WorkerClientError {
	constructor() {
		super(
			`Connection parameters must be less than ${MAX_CONN_PARAMS_SIZE} bytes`,
		);
	}
}

export class MalformedResponseMessage extends WorkerClientError {
	constructor(cause?: unknown) {
		super(`Malformed response message: ${cause}`, { cause });
	}
}

export class WorkerError extends WorkerClientError {
	constructor(
		public readonly code: string,
		message: string,
		public readonly metadata?: unknown,
	) {
		super(message);
	}
}

export class HttpRequestError extends WorkerClientError {
	constructor(message: string, opts?: { cause?: unknown }) {
		super(`HTTP request error: ${message}`, { cause: opts?.cause });
	}
}

export class WorkerConnDisposed extends WorkerClientError {
	constructor() {
		super("Attempting to interact with a disposed worker connection.");
	}
}
