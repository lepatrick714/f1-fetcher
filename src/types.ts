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

// OpenF1 driver info
export interface DriverInfo {
  broadcast_name?: string;
  country_code?: string;
  driver_number: number;
  first_name?: string;
  full_name?: string;
  headshot_url?: string;
  last_name?: string;
  meeting_key?: number;
  name_acronym?: string;
  session_key?: number;
  team_colour?: string; // RRGGBB
  team_name?: string;
}

// OpenF1 car_data sample (3.7 Hz)
export interface CarDataSample {
  brake: number; // 0 or 100
  date: string; // ISO8601
  driver_number: number;
  drs: number; // enum-like status
  meeting_key: number;
  n_gear: number; // 0..8
  rpm: number;
  session_key: number;
  speed: number; // km/h
  throttle: number; // percent
}