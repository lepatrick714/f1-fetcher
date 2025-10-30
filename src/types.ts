export interface TelemetryPoint {
  date: string;
  driver_number: number;
  meeting_key: number;
  session_key: number;
  x: number;
  y: number;
  z: number;
}

export interface SessionInfo {
  circuit_key?: number;
  circuit_short_name?: string;
  country_code?: string;
  country_key?: number;
  country_name?: string;
  date_end: string;
  date_start: string;
  gmt_offset?: string;
  location: string;
  meeting_key: number;
  session_key: number;
  session_name: string;
  session_type: string;
  year: number;
}

export interface SavedRaceData {
  sessionInfo: SessionInfo;
  telemetryData: { [driverNumber: string]: TelemetryPoint[] };
  savedAt: string;
}