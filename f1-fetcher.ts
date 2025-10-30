// f1-fetcher.ts
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface TelemetryPoint {
  date: string;
  driver_number: number;
  meeting_key: number;
  session_key: number;
  x: number;
  y: number;
  z: number;
}

interface SessionInfo {
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

interface SavedRaceData {
  sessionInfo: SessionInfo;
  telemetryData: { [driverNumber: string]: TelemetryPoint[] };
  savedAt: string;
}

const dataDir = path.join(process.cwd(), 'f1_data');
const cacheDir = path.join(process.cwd(), '.f1_cache');

class F1DataFetcher {
  private baseUrl = 'https://api.openf1.org/v1';
  private maxRetries = 10;
  private baseDelay = 1000;
  private delayBetweenDrivers = 1000;

  constructor() {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    console.log("dataDir: ", dataDir);
    console.log("cacheDir: ", cacheDir);
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async fetchWithRetry(url: string, retryCount = 0): Promise<any> {
    try {
      console.log(`  Fetching: ${url}`);
      const response = await fetch(url);

      if (response.status === 429) {
        if (retryCount >= this.maxRetries) {
          throw new Error(`Max retries (${this.maxRetries}) exceeded for rate limit`);
        }
        const delay = this.baseDelay * Math.pow(2, retryCount);
        console.log(`  ⚠️  Rate limit hit (429). Retrying in ${delay / 1000}s... (Attempt ${retryCount + 1}/${this.maxRetries})`);
        await this.sleep(delay);
        return this.fetchWithRetry(url, retryCount + 1);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.detail && data.detail.includes('too much data')) {
        throw new Error('API returned too much data error');
      }

      return data;
    } catch (error) {
      if (retryCount >= this.maxRetries) {
        throw error;
      }
      const delay = this.baseDelay * Math.pow(2, retryCount);
      console.log(`  ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}. Retrying in ${delay / 1000}s... (Attempt ${retryCount + 1}/${this.maxRetries})`);
      await this.sleep(delay);
      return this.fetchWithRetry(url, retryCount + 1);
    }
  }

  async listRaces(year: number, useCache: boolean = true): Promise<SessionInfo[]> {
    const cacheFile = path.join(cacheDir, `races_${year}.json`);

    // Try to load from cache
    if (useCache && fs.existsSync(cacheFile)) {
      console.log(`\n🏁 Loading races for ${year} from cache...`);
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      console.log(`✅ Found ${cached.length} races (cached)\n`);
      return cached;
    }

    console.log(`\n🏁 Fetching races for ${year} from API...`);
    const sessions = await this.fetchWithRetry(
      `${this.baseUrl}/sessions?session_type=Race&year=${year}`
    );

    // Save to cache
    fs.writeFileSync(cacheFile, JSON.stringify(sessions, null, 2));
    console.log(`✅ Found ${sessions.length} races (saved to cache)\n`);

    return sessions;
  }

  async getDriversForSession(sessionKey: number, useCache: boolean = true): Promise<number[]> {
    const cacheFile = path.join(cacheDir, `drivers_${sessionKey}.json`);

    // Try to load from cache
    if (useCache && fs.existsSync(cacheFile)) {
      console.log('👥 Loading drivers from cache...');
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      console.log(`✅ Found ${cached.length} drivers (cached): ${cached.join(', ')}`);
      return cached;
    }

    console.log('👥 Fetching available drivers from API...');
    const drivers = await this.fetchWithRetry(
      `${this.baseUrl}/drivers?session_key=${sessionKey}`
    );
    const driverNumbers = drivers.map((d: any) => d.driver_number).sort((a: number, b: number) => a - b);

    // Save to cache
    fs.writeFileSync(cacheFile, JSON.stringify(driverNumbers, null, 2));
    console.log(`✅ Found ${driverNumbers.length} drivers (saved to cache): ${driverNumbers.join(', ')}`);

    return driverNumbers;
  }

  async fetchRaceData(sessionKey: number, driverNumbers?: number[], useCache: boolean = true): Promise<SavedRaceData> {
    console.log(`\n🏎️  Fetching race data for session ${sessionKey}...`);

    // Get session info
    console.log('📋 Getting session information...');
    const sessions = await this.fetchWithRetry(
      `${this.baseUrl}/sessions?session_key=${sessionKey}`
    );
    const sessionInfo: SessionInfo = sessions[0];
    console.log(`✅ Session: ${sessionInfo.location} - ${sessionInfo.session_name}`);

    // Get available drivers if not specified
    if (!driverNumbers || driverNumbers.length === 0) {
      driverNumbers = await this.getDriversForSession(sessionKey, useCache);
    }

    // Fetch telemetry for each driver
    console.log(`\n📡 Fetching telemetry data for ${driverNumbers.length} drivers...`);
    const telemetryData: { [driverNumber: string]: TelemetryPoint[] } = {};
    let loadedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < driverNumbers.length; i++) {
      const driverNumber = driverNumbers[i];
      console.log(`\n[${i + 1}/${driverNumbers.length}] Driver #${driverNumber}`);

      try {
        // Add delay between requests (except first)
        if (i > 0) {
          console.log(`  ⏱️  Waiting ${this.delayBetweenDrivers / 1000}s to avoid rate limits...`);
          await this.sleep(this.delayBetweenDrivers);
        }

        const data = await this.fetchWithRetry(
          `${this.baseUrl}/location?session_key=${sessionKey}&driver_number=${driverNumber}`
        );

        if (data && data.length > 0) {
          // Sample every 5th point to reduce data size
          const sampledData = data
            .filter((_: any, idx: number) => idx % 5 === 0)
            .sort((a: TelemetryPoint, b: TelemetryPoint) =>
              new Date(a.date).getTime() - new Date(b.date).getTime()
            );

          telemetryData[driverNumber] = sampledData;
          loadedCount++;
          console.log(`  ✅ Loaded ${sampledData.length} points (sampled from ${data.length})`);
        } else {
          failedCount++;
          console.log(`  ⚠️  No data available`);
        }
      } catch (error) {
        failedCount++;
        console.log(`  ❌ Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    console.log(`\n📊 Summary: ${loadedCount} drivers loaded, ${failedCount} failed`);

    const savedData: SavedRaceData = {
      sessionInfo,
      telemetryData,
      savedAt: new Date().toISOString()
    };

    return savedData;
  }

  saveToFile(data: SavedRaceData): string {
    const filename = `f1_race_${data.sessionInfo.location.replace(/\s+/g, '_')}_${data.sessionInfo.session_key}.json`;
    const filepath = path.join(dataDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`\n💾 Saved to: ${filepath}`);

    const sizeMB = (fs.statSync(filepath).size / (1024 * 1024)).toFixed(2);
    console.log(`📦 File size: ${sizeMB} MB`);

    return filepath;
  }

  loadFromFile(filepath: string): SavedRaceData {
    console.log(`\n📁 Loading from: ${filepath}`);
    const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    console.log(`✅ Loaded ${Object.keys(data.telemetryData).length} drivers`);
    return data;
  }

  listCachedFiles(): string[] {
    // cached "race files" are saved in the cacheDir (./.cache)
    if (!fs.existsSync(cacheDir)) {
      return [];
    }
    const files = fs.readdirSync(cacheDir).filter(f => f.endsWith('.json'));
    if (files.length === 0) {
      console.log('\n📭 No cached data');
      return [];
    }

    return files;
  }

  clearCache(): void {
    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir);
      files.forEach(file => {
        fs.unlinkSync(path.join(cacheDir, file));
      });
      console.log(`\n🗑️  Cleared ${files.length} cache files`);
    } else {
      console.log('\n📭 No cache to clear');
    }
  }

  showCacheInfo(): void {
    if (!fs.existsSync(cacheDir)) {
      console.log('\n📭 No cache directory found');
      return;
    }

    const files = fs.readdirSync(cacheDir).filter(f => f.endsWith('.json'));
    if (files.length === 0) {
      console.log('\n📭 No cached data');
      return;
    }

    console.log(`\n💾 Cache Info (${files.length} files):\n`);
    files.forEach((file, idx) => {
      const filepath = path.join(cacheDir, file);
      const stats = fs.statSync(filepath);
      const sizeKB = (stats.size / 1024).toFixed(2);
      const modified = stats.mtime.toLocaleDateString();
      console.log(`${idx + 1}. ${file}`);
      console.log(`   Size: ${sizeKB} KB | Modified: ${modified}`);
    });
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const fetcher = new F1DataFetcher();

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
🏎️  F1 Data Fetcher CLI

Usage:
  node f1-fetcher.js list <year> [--no-cache]       # List available races
  node f1-fetcher.js fetch <session_key> [drivers] [--no-cache]  # Fetch race data
  node f1-fetcher.js cached                         # List cached race files
  node f1-fetcher.js cache-info                     # Show cache information
  node f1-fetcher.js clear-cache                    # Clear all cache

Examples:
  node f1-fetcher.js list 2023
  node f1-fetcher.js list 2023 --no-cache           # Force fresh API call
  node f1-fetcher.js fetch 9161                     # Fetch all drivers
  node f1-fetcher.js fetch 9161 1,44,81             # Fetch specific drivers
  node f1-fetcher.js fetch 9161 --no-cache          # Bypass cache
  node f1-fetcher.js cached
  node f1-fetcher.js cache-info
  node f1-fetcher.js clear-cache

Cache:
  - Race lists cached in .cache/races_<year>.json
  - Driver lists cached in .cache/drivers_<session_key>.json
  - Race data saved in ./f1_data/
    `);
    return;
  }

  const command = args[0];

  console.log("command: ", command);

  try {
    if (command === 'list') {
      const year = parseInt(args[1] || '2023');
      const useCache = !args.includes('--no-cache');
      const races = await fetcher.listRaces(year, useCache);

      races.forEach((race, idx) => {
        const date = new Date(race.date_start).toLocaleDateString();
        console.log(`${idx + 1}. ${race.location} (${race.country_name})`);
        console.log(`   Session Key: ${race.session_key}`);
        console.log(`   Date: ${date}\n`);
      });
    } else if (command === 'fetch') {
      const sessionKey = parseInt(args[1]);
      if (!sessionKey) {
        console.error('❌ Error: session_key is required');
        return;
      }

      const useCache = !args.includes('--no-cache');
      let driverNumbers: number[] | undefined;

      // Check if second arg is drivers or flag
      if (args[2] && !args[2].startsWith('--')) {
        driverNumbers = args[2].split(',').map(n => parseInt(n.trim()));
        console.log(`🎯 Fetching specific drivers: ${driverNumbers.join(', ')}`);
      }

      const data = await fetcher.fetchRaceData(sessionKey, driverNumbers, useCache);
      fetcher.saveToFile(data);
      console.log('\n✅ Done!');
    } else if (command === 'cached') {
      const files = fetcher.listCachedFiles();
      if (files.length === 0) {
        console.log('\n📭 No cached files found');
      } else {
        console.log(`\n📚 Cached race files (${files.length}):\n`);
        files.forEach((file, idx) => {
          const filepath = path.join(cacheDir, file);
          const sizeMB = (fs.statSync(filepath).size / (1024 * 1024)).toFixed(2);
          console.log(`${idx + 1}. ${file} (${sizeMB} MB)`);
        });
      }
    } else if (command === 'cache-info') {
      fetcher.showCacheInfo();
    } else if (command === 'clear-cache') {
      fetcher.clearCache();
    } else {
      console.error(`❌ Unknown command: ${command}`);
      console.log('Run with --help for usage information');
    }
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

main();