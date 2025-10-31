import { withRetry } from './retry';
import type { SessionInfo, DriverInfo, CarDataSample } from './types';

export const API_CLIENT_SESSION_KEY_NAME = 'session_key';
export const API_CLIENT_DRIVER_NUMBER_KEY_NAME = 'driver_number';
export class ApiClient {

  constructor(private baseUrl: string = 'https://api.openf1.org/v1') { }

  private async fetchJson<T>(url: string) {
    console.log('DEBUG fetch url:', url);
    return withRetry(async () => {
      const res = await fetch(url);
      console.log('DEBUG status:', res.status, res.statusText);
      const txt = await res.text();
      console.log('DEBUG body snippet:', txt.slice(0, 1000));

      // try parse JSON, fall back to raw text
      let parsed: any = null;
      try {
        parsed = txt ? JSON.parse(txt) : null;
      } catch {
        parsed = txt;
      }

      // Respect 429 Retry-After and make it retryable
      if (res.status === 429) {
        const ra = res.headers.get('retry-after');
        const retryAfterMs = ra ? parseFloat(ra) * 1000 : undefined;
        const err: any = new Error('429');
        if (retryAfterMs) err.retryAfter = retryAfterMs;
        throw err;
      }

      // Retry on server errors (5xx)
      if (res.status >= 500 && res.status < 600) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      // For client errors (4xx), return the parsed body so callers can inspect .detail, etc.
      // For 2xx, return parsed body as expected.
      return parsed as T;
    });
  }

  // fetch a single session by session_key
  async fetchSession(sessionKey: number): Promise<SessionInfo[]> {
    const url = `${this.baseUrl}/sessions?${API_CLIENT_SESSION_KEY_NAME}=${sessionKey}`;
    return this.fetchJson<SessionInfo[]>(url);
  }

  async fetchSessions(year: number): Promise<SessionInfo[]> {
    const url = `${this.baseUrl}/sessions?session_type=Race&year=${year}`;
    return this.fetchJson<SessionInfo[]>(url);
  }

  async fetchDrivers(sessionKey: number): Promise<{ driver_number: number }[]> {
    const url = `${this.baseUrl}/drivers?${API_CLIENT_SESSION_KEY_NAME}=${sessionKey}`;
    return this.fetchJson<{ driver_number: number }[]>(url);
  }

  // Detailed driver info (headshot_url, team_colour, etc.)
  async fetchDriverDetails(sessionKey: number, driverNumber?: number): Promise<DriverInfo[]> {
    const parts: string[] = [ `${API_CLIENT_SESSION_KEY_NAME}=${sessionKey}` ];
    if (driverNumber != null) parts.push(`${API_CLIENT_DRIVER_NUMBER_KEY_NAME}=${driverNumber}`);
    const url = `${this.baseUrl}/drivers?${parts.join('&')}`;
    return this.fetchJson<DriverInfo[]>(url);
  }

  async fetchLocation(sessionKey: number, driverNumber?: number) {
    const url = driverNumber
      ? `${this.baseUrl}/location?${API_CLIENT_SESSION_KEY_NAME}=${sessionKey}&${API_CLIENT_DRIVER_NUMBER_KEY_NAME}=${driverNumber}`
      : `${this.baseUrl}/location?${API_CLIENT_SESSION_KEY_NAME}=${sessionKey}`;
    return this.fetchJson<any>(url);
  }

  // fetch all location for a session (no driver) - useful to split by driver locally
  async fetchLocationForSession(sessionKey: number) {
    const url = `${this.baseUrl}/location?${API_CLIENT_SESSION_KEY_NAME}=${sessionKey}`;
    return this.fetchJson<any>(url);
  }

  // fetch a time-windowed location slice for a driver (uses encoded operators)
  async fetchLocationWindow(sessionKey: number, driverNumber: number, dateFromIso: string, dateToIso: string) {
    const parts: string[] = [
      `${API_CLIENT_SESSION_KEY_NAME}=${sessionKey}`,
      `${API_CLIENT_DRIVER_NUMBER_KEY_NAME}=${driverNumber}`,
      // encode "date>" and "date<" operators
      `${encodeURIComponent('date>')}${encodeURIComponent(dateFromIso)}`,
      `${encodeURIComponent('date<')}${encodeURIComponent(dateToIso)}`
    ];
    const qs = parts.join('&');
    const url = `${this.baseUrl}/location?${qs}`;
    return this.fetchJson<any>(url);
  }

  // Car data (3.7Hz) — same param shape as fetchLocationWindow
  async fetchCarData(sessionKey: number, driverNumber: number): Promise<CarDataSample[]> {
    const parts: string[] = [
      `${API_CLIENT_SESSION_KEY_NAME}=${sessionKey}`,
      `${API_CLIENT_DRIVER_NUMBER_KEY_NAME}=${driverNumber}`,
    ];
    const qs = parts.join('&');
    const url = `${this.baseUrl}/car_data?${qs}`;
    return this.fetchJson<CarDataSample[]>(url);
  }
}