export type ServiceErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "INSUFFICIENT_DATA"
  | "REGISTRY_UNAVAILABLE"
  | "UPSTREAM_ERROR"
  | "UPSTREAM_TIMEOUT";

export class ServiceError extends Error {
  constructor(
    public readonly code: ServiceErrorCode,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new ServiceError("UPSTREAM_TIMEOUT", `${label} timed out after ${timeoutMs}ms.`, true)),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function withAbortTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  const controller = new AbortController();
  try {
    return await withTimeout(
      Promise.resolve().then(() => operation(controller.signal)),
      timeoutMs,
      label,
    );
  } catch (error) {
    if (error instanceof ServiceError && error.code === "UPSTREAM_TIMEOUT") {
      controller.abort(error);
    }
    throw error;
  }
}
