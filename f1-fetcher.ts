// f1-fetcher.ts
import * as fs from 'fs';
import * as path from 'path';
// os import removed - not used
import { ApiClient } from './src/api-client';
import { FileCache } from './src/cache';

interface locationPoint {
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
  locationData: { [driverNumber: string]: locationPoint[] };
  savedAt: string;
}

class F1DataFetcher {
  // reuse existing dirs (project-local)
  private dataDir = path.join(process.cwd(), 'f1_data');
  private cacheDir = path.join(process.cwd(), '.f1_cache');

  // expose dirs for external use (CLI, tests)
  getDataDir(): string {
    return this.dataDir;
  }

  getCacheDir(): string {
    return this.cacheDir;
  }

  // new modules
  private api = new ApiClient();
  private dataCache = new FileCache(this.dataDir);
  private metaCache = new FileCache(this.cacheDir);

  private delayBetweenDrivers = 1000;

  constructor() {
    // ensure dirs (keep using sync for CLI friendliness)
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    console.log("dataDir: ", this.dataDir);
    console.log("cacheDir: ", this.cacheDir);
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async listRaces(year: number, useCache: boolean = true): Promise<SessionInfo[]> {
    const key = `races_${year}`;

    if (useCache) {
      const cached = await this.metaCache.read<SessionInfo[]>(key);
      if (cached && cached.length) {
        console.log(`\n🏁 Loading races for ${year} from cache...`);
        console.log(`✅ Found ${cached.length} races (cached)\n`);
        return cached;
      }
    }

    console.log(`\n🏁 Fetching races for ${year} from API...`);
    const sessions = await this.api.fetchSessions(year);

    // Save to cache
    await this.metaCache.write(key, sessions);
    console.log(`✅ Found ${sessions.length} races (saved to cache)\n`);

    return sessions;
  }

  async getDriversForSession(sessionKey: number, useCache: boolean = true): Promise<number[]> {
    const key = `drivers_${sessionKey}`;

    if (useCache) {
      const cached = await this.metaCache.read<number[]>(key);
      if (cached && cached.length) {
        console.log('👥 Loading drivers from cache...');
        console.log(`✅ Found ${cached.length} drivers (cached): ${cached.join(', ')}`);
        return cached;
      }
    }

    console.log('👥 Fetching available drivers from API...');
    const drivers = await this.api.fetchDrivers(sessionKey);
    const driverNumbers = drivers.map((d: any) => d.driver_number).sort((a: number, b: number) => a - b);

    await this.metaCache.write(key, driverNumbers);
    console.log(`✅ Found ${driverNumbers.length} drivers (saved to cache): ${driverNumbers.join(', ')}`);

    return driverNumbers;
  }

  async fetchRaceData(sessionKey: number, driverNumbers?: number[], useCache: boolean = true): Promise<SavedRaceData> {
    console.log(`\n🏎️  Fetching race data for session ${sessionKey}...`);

    // Get session info
    console.log('📋 Getting session information...');
    const sessions = await this.api.fetchSession(sessionKey);
    if (!sessions || sessions.length === 0) {
      throw new Error(`No session found for session_key=${sessionKey}`);
    }
    const sessionInfo: SessionInfo = sessions[0];
    console.log(`✅ Session: ${sessionInfo.location} - ${sessionInfo.session_name}`);

    // Get available drivers if not specified
    if (!driverNumbers || driverNumbers.length === 0) {
      driverNumbers = await this.getDriversForSession(sessionKey, useCache);
    }

    // Fetch location for each driver
    console.log(`\n📡 Fetching location data for ${driverNumbers.length} drivers...`);
    const locationData: { [driverNumber: string]: locationPoint[] } = {};
    let loadedCount = 0;
    let failedCount = 0;

    // Try fetching session-level location first and split by driver_number
    console.log('\n📡 Probing session-level location (single request)...');
    try {
      const sessionlocation = await this.api.fetchLocationForSession(sessionKey);
      if (Array.isArray(sessionlocation) && sessionlocation.length > 0) {
        console.log(`  ✅ Session location returned ${sessionlocation.length} points — splitting by driver`);
        // group by driver_number
        const byDriver: { [k: number]: locationPoint[] } = {};
        for (const p of sessionlocation) {
          const dn = p.driver_number;
          if (!byDriver[dn]) byDriver[dn] = [];
          byDriver[dn].push(p);
        }
        // if caller specified a driver subset, pick those; otherwise use all found drivers
        const driversToProcess = (driverNumbers && driverNumbers.length) ? driverNumbers : Object.keys(byDriver).map(n => parseInt(n, 10));
        for (const dn of driversToProcess) {
          const data = byDriver[dn] || [];
          if (data.length > 0) {
            locationData[dn] = data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            loadedCount++;
            console.log(`  ✅ Driver #${dn}: ${locationData[dn].length} points`);
          } else {
            failedCount++;
            console.log(`  ⚠️  Driver #${dn}: No data`);
          }
        }
        // skip per-driver fetch loop below
      } else {
        console.log('  ⚠️  Session-level location empty — falling back to per-driver requests');
        // fall through to per-driver loop as before
      }
    } catch (err) {
      console.log('  ⚠️  Session-level probe failed, falling back to per-driver:', err instanceof Error ? err.message : err);
      // fall through to per-driver loop
    }

    // ...existing per-driver loop remains (will run only if session-level yielded no data) ...
    for (let i = 0; i < driverNumbers.length; i++) {
      const driverNumber = driverNumbers[i];
      console.log(`\n[${i + 1}/${driverNumbers.length}] Driver #${driverNumber}`);

      try {
        if (i > 0) {
          console.log(`  ⏱️  Waiting ${this.delayBetweenDrivers / 1000}s to avoid rate limits...`);
          await this.sleep(this.delayBetweenDrivers);
        }

        const data = await this.api.fetchLocation(sessionKey, driverNumber);
        console.log('DEBUG raw location length:', Array.isArray(data) ? data.length : typeof data);
        locationData[driverNumber] = data; // temporarily keep raw to inspect

        if (data && data.length > 0) {
          const sampledData = data
            .filter((_: any, idx: number) => idx % 5 === 0)
            .sort((a: locationPoint, b: locationPoint) =>
              new Date(a.date).getTime() - new Date(b.date).getTime()
            );

          locationData[driverNumber] = sampledData;
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
      locationData,
      savedAt: new Date().toISOString()
    };

    return savedData;
  }

  saveToFile(data: SavedRaceData): string {
    const key = `f1_race_${data.sessionInfo.location.replace(/\s+/g, '_')}_${data.sessionInfo.session_key}`;
    // write is async but keep sync-style return by using sync write for compatibility
    const filePath = path.join(this.dataDir, `${key}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`\n💾 Saved to: ${filePath}`);

    const sizeMB = (fs.statSync(filePath).size / (1024 * 1024)).toFixed(2);
    console.log(`📦 File size: ${sizeMB} MB`);

    return filePath;
  }

  loadFromFile(filepath: string): SavedRaceData {
    console.log(`\n📁 Loading from: ${filepath}`);
    const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    console.log(`✅ Loaded ${Object.keys(data.locationData).length} drivers`);
    return data;
  }

  listCachedFiles(): string[] {
    // race files live in dataDir
    if (!fs.existsSync(this.dataDir)) {
      return [];
    }
    const files = fs.readdirSync(this.dataDir).filter(f => f.endsWith('.json'));
    if (files.length === 0) {
      console.log('\n📭 No cached data');
      return [];
    }
    return files;
  }

  clearCache(): void {
    if (fs.existsSync(this.cacheDir)) {
      const files = fs.readdirSync(this.cacheDir);
      files.forEach(file => {
        fs.unlinkSync(path.join(this.cacheDir, file));
      });
      console.log(`\n🗑️  Cleared ${files.length} cache files`);
    } else {
      console.log('\n📭 No cache to clear');
    }
  }

  showCacheInfo(): void {
    if (!fs.existsSync(this.cacheDir)) {
      console.log('\n📭 No cache directory found');
      return;
    }

    const files = fs.readdirSync(this.cacheDir).filter(f => f.endsWith('.json'));
    if (files.length === 0) {
      console.log('\n📭 No cached data');
      return;
    }

    console.log(`\n💾 Cache Info (${files.length} files):\n`);
    files.forEach((file, idx) => {
      const filepath = path.join(this.cacheDir, file);
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
  npx tsx f1-fetcher.ts list <year> [--no-cache]       # List available races
  npx tsx f1-fetcher.ts fetch <session_key> [drivers] [--no-cache]  # Fetch race data
  npx tsx f1-fetcher.ts cached                         # List cached race files
  npx tsx f1-fetcher.ts cache-info                     # Show cache information
  npx tsx f1-fetcher.ts clear-cache                    # Clear all cache

Examples:
  npx tsx f1-fetcher.ts list 2023
  npx tsx f1-fetcher.ts list 2023 --no-cache           # Force fresh API call
  npx tsx f1-fetcher.ts fetch 9161                     # Fetch all drivers
  npx tsx f1-fetcher.ts fetch 9161 1,44,81             # Fetch specific drivers
  npx tsx f1-fetcher.ts fetch 9161 --no-cache          # Bypass cache
  npx tsx f1-fetcher.ts cached
  npx tsx f1-fetcher.ts cache-info
  npx tsx f1-fetcher.ts clear-cache

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
      const loadedDrivers = Object.keys(data.locationData).length;
      if (loadedDrivers === 0) {
        console.warn('\n⚠️  No location loaded — not saving empty file');
      } else {
        fetcher.saveToFile(data);
        console.log('\n✅ Done!');
      }
    } else if (command === 'cached') {
      const files = fetcher.listCachedFiles();
      if (files.length === 0) {
        console.log('\n📭 No cached files found');
      } else {
        console.log(`\n📚 Cached race files (${files.length}):\n`);
        files.forEach((file, idx) => {
          const filepath = path.join(fetcher.getDataDir(), file);
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