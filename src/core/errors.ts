export type ServiceErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "INSUFFICIENT_DATA"
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
