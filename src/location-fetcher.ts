import { ApiClient } from './api-client';
import { withRetry } from './retry';
import type { SessionInfo, TelemetryPoint, CarDataSample } from './types';

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

  // Helper: tiny sleep

  // Helper: detect the OpenF1 "too much data" sentinel on either success payload or error-like shape
  private isTooMuchResponse(obj: unknown): boolean {
    if (!obj || typeof obj !== 'object') return false;
    const detail = (obj as any).detail;
    return typeof detail === 'string' && detail.toLowerCase().includes('too much');
  }

  // Helper: ISO string from epoch ms (keeps formatting consistent)
  private toIso(ms: number): string {
    return new Date(ms).toISOString();
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
      const dateFromIso = this.toIso(cursor);
      const dateToIso = this.toIso(windowEnd);

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
        if (this.isTooMuchResponse(chunk)) {
          // shrink window and retry the same span
          windowMs = Math.max(this.minWindowMs, Math.floor(windowMs / 2));
          console.log(`  ⚠️  Too much data (location) ${dateFromIso} → ${dateToIso}; shrinking window to ${windowMs}ms and retrying`);
          // don't advance cursor
          continue;
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
        if (msg.toLowerCase().includes('too much') || this.isTooMuchResponse(err)) {
          windowMs = Math.max(this.minWindowMs, Math.floor(windowMs / 2));
          console.log(`  ⚠️  Too much data (location error) ${dateFromIso} → ${dateToIso}; shrinking window to ${windowMs}ms and retrying`);
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

  /**
   * Fetch BOTH location and car_data for a single driver by chunking time.
   * Runs the two windowed requests in parallel and advances the window based on
   * the location response. Car data failures don't block location progress.
   */
  async fetchDriverChunkedWithCarData(sessionInfo: SessionInfo, driverNumber: number): Promise<{ locations: TelemetryPoint[]; carData: CarDataSample[] }> {
    const startMs = new Date(sessionInfo.date_start).getTime();
    const endMs = new Date(sessionInfo.date_end).getTime();
    if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) {
      throw new Error('Invalid session start/end dates');
    }

    let windowMs = this.initialWindowMs;
    const totalMs = endMs - startMs;
    let cursor = startMs;
    const locResults: TelemetryPoint[] = [];
    const carResults: CarDataSample[] = [];
    const seenLoc = new Set<string>();
    const seenCar = new Set<string>();

    while (cursor < endMs) {
      const windowEnd = Math.min(cursor + windowMs, endMs);
      const dateFromIso = this.toIso(cursor);
      const dateToIso = this.toIso(windowEnd);

      const fetchLocationWindow = async () => this.api.fetchLocationWindow(sessionInfo.session_key, driverNumber, dateFromIso, dateToIso);
      const fetchCarWindow = async () => this.api.fetchCarData(sessionInfo.session_key, driverNumber);

      // Execute both in parallel with retries
      const [locSettled, carSettled] = await Promise.allSettled([
        withRetry(fetchLocationWindow, { maxRetries: this.maxRetriesPerWindow, baseDelayMs: 500, backoffFactor: 2, jitter: true }),
        withRetry(fetchCarWindow, { maxRetries: this.maxRetriesPerWindow, baseDelayMs: 500, backoffFactor: 2, jitter: true })
      ]);

      // Handle location response first (controls window advance)
      if (locSettled.status === 'fulfilled') {
        const chunk = locSettled.value as unknown;
        if (this.isTooMuchResponse(chunk)) {
          windowMs = Math.max(this.minWindowMs, Math.floor(windowMs / 2));
          console.log(`  ⚠️  Too much data (location) ${dateFromIso} → ${dateToIso}; shrinking window to ${windowMs}ms and retrying`);
          continue; // retry same span
        }
        if (Array.isArray(chunk) && chunk.length > 0) {
          for (const p of chunk as TelemetryPoint[]) {
            const key = `${p.driver_number}|${p.date}`;
            if (!seenLoc.has(key)) {
              seenLoc.add(key);
              locResults.push(p);
            }
          }
        }
        // advance on successful locationor
        this.progress?.(Math.min(windowEnd - startMs, totalMs), totalMs);
        cursor = windowEnd;
      } else {
        // On error, check for too-much to reduce window; else rethrow
        const reason = locSettled.reason as unknown;
        const msg = String((reason as any)?.message ?? reason ?? '');
        if (msg.toLowerCase().includes('too much') || this.isTooMuchResponse(reason)) {
          windowMs = Math.max(this.minWindowMs, Math.floor(windowMs / 2));
          console.log(`  ⚠️  Too much data (location error) ${dateFromIso} → ${dateToIso}; shrinking window to ${windowMs}ms and retrying`);
          continue;
        }
        throw locSettled.reason;
      }

      // Process car data (best-effort)
      if (carSettled.status === 'fulfilled') {
        const carChunk = carSettled.value as unknown;
        if (Array.isArray(carChunk) && carChunk.length > 0) {
          for (const c of carChunk as CarDataSample[]) {
            const key = `${c.driver_number}|${c.date}`;
            if (!seenCar.has(key)) {
              seenCar.add(key);
              carResults.push(c);
            }
          }
        }
      } else {
        // best-effort: don't affect windowing; keep logs terse
        const reason = carSettled.reason as unknown;
        const msg = String((reason as any)?.message ?? reason ?? '');
        console.warn(`  ⚠️  Car data window failed ${dateFromIso} → ${dateToIso}: ${msg}`);
      }

      if (this.delayBetweenRequestsMs > 0) await sleep(this.delayBetweenRequestsMs);
    }

    // sort
    locResults.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    carResults.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return { locations: locResults, carData: carResults };
  }
}