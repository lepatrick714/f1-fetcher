import { ApiClient } from './api-client';
import { withRetry } from './retry';
import type { SessionInfo, TelemetryPoint } from './types';

export type LocationFetcherOptions = {
  initialWindowMs?: number;        // starting chunk window (ms)
  minWindowMs?: number;            // smallest allowed window before giving up
  maxRetriesPerWindow?: number;    // retry attempts per window (exponential backoff used)
  delayBetweenRequestsMs?: number;  // delay between successful chunk requests
  progress?: (doneMs: number, totalMs: number) => void; // simple progress callback
};

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

export class LocationFetcher {
  private initialWindowMs: number;
  private minWindowMs: number;
  private maxRetriesPerWindow: number;
  private delayBetweenRequestsMs: number;
  private progress?: (doneMs: number, totalMs: number) => void;

  constructor(private api: ApiClient, opts: LocationFetcherOptions = {}) {
    this.initialWindowMs = opts.initialWindowMs ?? 5000;
    this.minWindowMs = opts.minWindowMs ?? 250; // don't go below ~250ms windows
    this.maxRetriesPerWindow = opts.maxRetriesPerWindow ?? 4;
    this.delayBetweenRequestsMs = opts.delayBetweenRequestsMs ?? 200; // small throttle
    this.progress = opts.progress;
  }

  /**
   * Fetch location data for a single driver across the session by chunking the session time span.
   * - Respects exponential retry (via withRetry) for transient failures.
   * - On "too much data" style errors will halve the window and retry the same span.
   * - Calls progress(doneMs, totalMs) where useful.
   */
  async fetchDriverChunked(sessionInfo: SessionInfo, driverNumber: number): Promise<TelemetryPoint[]> {
    const startMs = new Date(sessionInfo.date_start).getTime();
    const endMs = new Date(sessionInfo.date_end).getTime();
    if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) {
      throw new Error('Invalid session start/end dates');
    }

    let windowMs = this.initialWindowMs;
    const totalMs = endMs - startMs;
    let cursor = startMs;
    const results: TelemetryPoint[] = [];
    const seen = new Set<string>(); // dedupe by `${driverNumber}|${date}`

    while (cursor < endMs) {
      const windowEnd = Math.min(cursor + windowMs, endMs);
      const dateFromIso = new Date(cursor).toISOString();
      const dateToIso = new Date(windowEnd).toISOString();

      // fetch function for this window (wrapped for withRetry)
      const fetchWindow = async () => {
        return await this.api.fetchLocationWindow(sessionInfo.session_key, driverNumber, dateFromIso, dateToIso);
      };

      try {
        const chunk = await withRetry(fetchWindow, {
          maxRetries: this.maxRetriesPerWindow,
          baseDelayMs: 500,
          backoffFactor: 2,
          jitter: true
        });

        // if API returns the "too much data" JSON detail, handle as string/obj
        if (chunk && typeof chunk === 'object' && 'detail' in chunk && typeof chunk.detail === 'string') {
          const detail = (chunk as any).detail as string;
          if (detail.toLowerCase().includes('too much')) {
            // shrink window and retry the same span
            windowMs = Math.max(this.minWindowMs, Math.floor(windowMs / 2));
            console.log(`  ⚠️  Too much data for ${dateFromIso} -> ${dateToIso}, reducing window to ${windowMs}ms and retrying`);
            // don't advance cursor
            continue;
          }
        }

        if (Array.isArray(chunk) && chunk.length > 0) {
          for (const p of chunk) {
            const key = `${p.driver_number}|${p.date}`;
            if (!seen.has(key)) {
              seen.add(key);
              results.push(p as TelemetryPoint);
            }
          }
        }

        // progress callback (done ms = windowEnd - start)
        this.progress?.(Math.min(windowEnd - startMs, totalMs), totalMs);

        // advance cursor only after a successful fetch
        cursor = windowEnd;

        // small throttle between windows
        if (this.delayBetweenRequestsMs > 0) await sleep(this.delayBetweenRequestsMs);

      } catch (err: any) {
        // If the error message mentions too much data, reduce window and retry same span.
        const msg = err?.message ?? String(err);
        if (msg.toLowerCase().includes('too much')) {
          windowMs = Math.max(this.minWindowMs, Math.floor(windowMs / 2));
          console.log(`  ⚠️  API said too much data; reducing window to ${windowMs}ms and retrying`);
          continue;
        }
        // For other errors, rethrow so caller can handle/abort
        throw err;
      }
    }

    // final sort by date and return
    results.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return results;
  }
}