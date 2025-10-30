export type RetryOptions = {
  maxRetries?: number;
  baseDelayMs?: number;
  backoffFactor?: number;
  jitter?: boolean;
};

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 5,
    baseDelayMs = 500,
    backoffFactor = 2,
    jitter = true
  } = opts;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const isLast = attempt === maxRetries;

      // If caller provided a retryAfter value on the error, respect it
      const retryAfterMs = (typeof err?.retryAfter === 'number') ? err.retryAfter : null;
      if (isLast) throw err;

      let delay = retryAfterMs ?? Math.floor(baseDelayMs * Math.pow(backoffFactor, attempt));
      if (jitter) {
        // jitter between 0.5x and 1.5x
        const jitterFactor = 0.5 + Math.random();
        delay = Math.floor(delay * jitterFactor);
      }

      await sleep(delay);
      // loop to retry
    }
  }

  // unreachable
  throw new Error('withRetry: exceeded retries');
}