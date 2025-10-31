"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
// f1-fetcher.ts
var fs = require("fs");
var path = require("path");
// os import removed - not used
var api_client_1 = require("./src/api-client");
var cache_1 = require("./src/cache");
var F1DataFetcher = /** @class */ (function () {
    function F1DataFetcher() {
        // reuse existing dirs (project-local)
        this.dataDir = path.join(process.cwd(), 'f1_data');
        this.cacheDir = path.join(process.cwd(), '.f1_cache');
        // new modules
        this.api = new api_client_1.ApiClient();
        this.dataCache = new cache_1.FileCache(this.dataDir);
        this.metaCache = new cache_1.FileCache(this.cacheDir);
        this.delayBetweenDrivers = 1000;
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
    // expose dirs for external use (CLI, tests)
    F1DataFetcher.prototype.getDataDir = function () {
        return this.dataDir;
    };
    F1DataFetcher.prototype.getCacheDir = function () {
        return this.cacheDir;
    };
    F1DataFetcher.prototype.sleep = function (ms) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve) { return setTimeout(resolve, ms); })];
            });
        });
    };
    F1DataFetcher.prototype.listRaces = function (year_1) {
        return __awaiter(this, arguments, void 0, function (year, useCache) {
            var key, cached, sessions;
            if (useCache === void 0) { useCache = true; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        key = "races_".concat(year);
                        if (!useCache) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.metaCache.read(key)];
                    case 1:
                        cached = _a.sent();
                        if (cached && cached.length) {
                            console.log("\n\uD83C\uDFC1 Loading races for ".concat(year, " from cache..."));
                            console.log("\u2705 Found ".concat(cached.length, " races (cached)\n"));
                            return [2 /*return*/, cached];
                        }
                        _a.label = 2;
                    case 2:
                        console.log("\n\uD83C\uDFC1 Fetching races for ".concat(year, " from API..."));
                        return [4 /*yield*/, this.api.fetchSessions(year)];
                    case 3:
                        sessions = _a.sent();
                        // Save to cache
                        return [4 /*yield*/, this.metaCache.write(key, sessions)];
                    case 4:
                        // Save to cache
                        _a.sent();
                        console.log("\u2705 Found ".concat(sessions.length, " races (saved to cache)\n"));
                        return [2 /*return*/, sessions];
                }
            });
        });
    };
    F1DataFetcher.prototype.getDriversForSession = function (sessionKey_1) {
        return __awaiter(this, arguments, void 0, function (sessionKey, useCache) {
            var key, cached, drivers, driverNumbers;
            if (useCache === void 0) { useCache = true; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        key = "drivers_".concat(sessionKey);
                        if (!useCache) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.metaCache.read(key)];
                    case 1:
                        cached = _a.sent();
                        if (cached && cached.length) {
                            console.log('👥 Loading drivers from cache...');
                            console.log("\u2705 Found ".concat(cached.length, " drivers (cached): ").concat(cached.join(', ')));
                            return [2 /*return*/, cached];
                        }
                        _a.label = 2;
                    case 2:
                        console.log('👥 Fetching available drivers from API...');
                        return [4 /*yield*/, this.api.fetchDrivers(sessionKey)];
                    case 3:
                        drivers = _a.sent();
                        driverNumbers = drivers.map(function (d) { return d.driver_number; }).sort(function (a, b) { return a - b; });
                        return [4 /*yield*/, this.metaCache.write(key, driverNumbers)];
                    case 4:
                        _a.sent();
                        console.log("\u2705 Found ".concat(driverNumbers.length, " drivers (saved to cache): ").concat(driverNumbers.join(', ')));
                        return [2 /*return*/, driverNumbers];
                }
            });
        });
    };
    F1DataFetcher.prototype.fetchRaceData = function (sessionKey_1, driverNumbers_1) {
        return __awaiter(this, arguments, void 0, function (sessionKey, driverNumbers, useCache) {
            var sessions, sessionInfo, locationData, loadedCount, failedCount, sessionlocation, byDriver, _i, sessionlocation_1, p, dn, driversToProcess, _a, driversToProcess_1, dn, data, err_1, i, driverNumber, data, sampledData, error_1, savedData;
            if (useCache === void 0) { useCache = true; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        console.log("\n\uD83C\uDFCE\uFE0F  Fetching race data for session ".concat(sessionKey, "..."));
                        // Get session info
                        console.log('📋 Getting session information...');
                        return [4 /*yield*/, this.api.fetchSession(sessionKey)];
                    case 1:
                        sessions = _b.sent();
                        if (!sessions || sessions.length === 0) {
                            throw new Error("No session found for session_key=".concat(sessionKey));
                        }
                        sessionInfo = sessions[0];
                        console.log("\u2705 Session: ".concat(sessionInfo.location, " - ").concat(sessionInfo.session_name));
                        if (!(!driverNumbers || driverNumbers.length === 0)) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.getDriversForSession(sessionKey, useCache)];
                    case 2:
                        driverNumbers = _b.sent();
                        _b.label = 3;
                    case 3:
                        // Fetch location for each driver
                        console.log("\n\uD83D\uDCE1 Fetching location data for ".concat(driverNumbers.length, " drivers..."));
                        locationData = {};
                        loadedCount = 0;
                        failedCount = 0;
                        // Try fetching session-level location first and split by driver_number
                        console.log('\n📡 Probing session-level location (single request)...');
                        _b.label = 4;
                    case 4:
                        _b.trys.push([4, 6, , 7]);
                        return [4 /*yield*/, this.api.fetchLocationForSession(sessionKey)];
                    case 5:
                        sessionlocation = _b.sent();
                        if (Array.isArray(sessionlocation) && sessionlocation.length > 0) {
                            console.log("  \u2705 Session location returned ".concat(sessionlocation.length, " points \u2014 splitting by driver"));
                            byDriver = {};
                            for (_i = 0, sessionlocation_1 = sessionlocation; _i < sessionlocation_1.length; _i++) {
                                p = sessionlocation_1[_i];
                                dn = p.driver_number;
                                if (!byDriver[dn])
                                    byDriver[dn] = [];
                                byDriver[dn].push(p);
                            }
                            driversToProcess = (driverNumbers && driverNumbers.length) ? driverNumbers : Object.keys(byDriver).map(function (n) { return parseInt(n, 10); });
                            for (_a = 0, driversToProcess_1 = driversToProcess; _a < driversToProcess_1.length; _a++) {
                                dn = driversToProcess_1[_a];
                                data = byDriver[dn] || [];
                                if (data.length > 0) {
                                    locationData[dn] = data.sort(function (a, b) { return new Date(a.date).getTime() - new Date(b.date).getTime(); });
                                    loadedCount++;
                                    console.log("  \u2705 Driver #".concat(dn, ": ").concat(locationData[dn].length, " points"));
                                }
                                else {
                                    failedCount++;
                                    console.log("  \u26A0\uFE0F  Driver #".concat(dn, ": No data"));
                                }
                            }
                            // skip per-driver fetch loop below
                        }
                        else {
                            console.log('  ⚠️  Session-level location empty — falling back to per-driver requests');
                            // fall through to per-driver loop as before
                        }
                        return [3 /*break*/, 7];
                    case 6:
                        err_1 = _b.sent();
                        console.log('  ⚠️  Session-level probe failed, falling back to per-driver:', err_1 instanceof Error ? err_1.message : err_1);
                        return [3 /*break*/, 7];
                    case 7:
                        i = 0;
                        _b.label = 8;
                    case 8:
                        if (!(i < driverNumbers.length)) return [3 /*break*/, 15];
                        driverNumber = driverNumbers[i];
                        console.log("\n[".concat(i + 1, "/").concat(driverNumbers.length, "] Driver #").concat(driverNumber));
                        _b.label = 9;
                    case 9:
                        _b.trys.push([9, 13, , 14]);
                        if (!(i > 0)) return [3 /*break*/, 11];
                        console.log("  \u23F1\uFE0F  Waiting ".concat(this.delayBetweenDrivers / 1000, "s to avoid rate limits..."));
                        return [4 /*yield*/, this.sleep(this.delayBetweenDrivers)];
                    case 10:
                        _b.sent();
                        _b.label = 11;
                    case 11: return [4 /*yield*/, this.api.fetchLocation(sessionKey, driverNumber)];
                    case 12:
                        data = _b.sent();
                        console.log('DEBUG raw location length:', Array.isArray(data) ? data.length : typeof data);
                        locationData[driverNumber] = data; // temporarily keep raw to inspect
                        if (data && data.length > 0) {
                            sampledData = data
                                .filter(function (_, idx) { return idx % 5 === 0; })
                                .sort(function (a, b) {
                                return new Date(a.date).getTime() - new Date(b.date).getTime();
                            });
                            locationData[driverNumber] = sampledData;
                            loadedCount++;
                            console.log("  \u2705 Loaded ".concat(sampledData.length, " points (sampled from ").concat(data.length, ")"));
                        }
                        else {
                            failedCount++;
                            console.log("  \u26A0\uFE0F  No data available");
                        }
                        return [3 /*break*/, 14];
                    case 13:
                        error_1 = _b.sent();
                        failedCount++;
                        console.log("  \u274C Failed: ".concat(error_1 instanceof Error ? error_1.message : 'Unknown error'));
                        return [3 /*break*/, 14];
                    case 14:
                        i++;
                        return [3 /*break*/, 8];
                    case 15:
                        console.log("\n\uD83D\uDCCA Summary: ".concat(loadedCount, " drivers loaded, ").concat(failedCount, " failed"));
                        savedData = {
                            sessionInfo: sessionInfo,
                            locationData: locationData,
                            savedAt: new Date().toISOString()
                        };
                        return [2 /*return*/, savedData];
                }
            });
        });
    };
    F1DataFetcher.prototype.saveToFile = function (data) {
        var key = "f1_race_".concat(data.sessionInfo.location.replace(/\s+/g, '_'), "_").concat(data.sessionInfo.session_key);
        // write is async but keep sync-style return by using sync write for compatibility
        var filePath = path.join(this.dataDir, "".concat(key, ".json"));
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log("\n\uD83D\uDCBE Saved to: ".concat(filePath));
        var sizeMB = (fs.statSync(filePath).size / (1024 * 1024)).toFixed(2);
        console.log("\uD83D\uDCE6 File size: ".concat(sizeMB, " MB"));
        return filePath;
    };
    F1DataFetcher.prototype.loadFromFile = function (filepath) {
        console.log("\n\uD83D\uDCC1 Loading from: ".concat(filepath));
        var data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
        console.log("\u2705 Loaded ".concat(Object.keys(data.locationData).length, " drivers"));
        return data;
    };
    F1DataFetcher.prototype.listCachedFiles = function () {
        // race files live in dataDir
        if (!fs.existsSync(this.dataDir)) {
            return [];
        }
        var files = fs.readdirSync(this.dataDir).filter(function (f) { return f.endsWith('.json'); });
        if (files.length === 0) {
            console.log('\n📭 No cached data');
            return [];
        }
        return files;
    };
    F1DataFetcher.prototype.clearCache = function () {
        var _this = this;
        if (fs.existsSync(this.cacheDir)) {
            var files = fs.readdirSync(this.cacheDir);
            files.forEach(function (file) {
                fs.unlinkSync(path.join(_this.cacheDir, file));
            });
            console.log("\n\uD83D\uDDD1\uFE0F  Cleared ".concat(files.length, " cache files"));
        }
        else {
            console.log('\n📭 No cache to clear');
        }
    };
    F1DataFetcher.prototype.showCacheInfo = function () {
        var _this = this;
        if (!fs.existsSync(this.cacheDir)) {
            console.log('\n📭 No cache directory found');
            return;
        }
        var files = fs.readdirSync(this.cacheDir).filter(function (f) { return f.endsWith('.json'); });
        if (files.length === 0) {
            console.log('\n📭 No cached data');
            return;
        }
        console.log("\n\uD83D\uDCBE Cache Info (".concat(files.length, " files):\n"));
        files.forEach(function (file, idx) {
            var filepath = path.join(_this.cacheDir, file);
            var stats = fs.statSync(filepath);
            var sizeKB = (stats.size / 1024).toFixed(2);
            var modified = stats.mtime.toLocaleDateString();
            console.log("".concat(idx + 1, ". ").concat(file));
            console.log("   Size: ".concat(sizeKB, " KB | Modified: ").concat(modified));
        });
    };
    return F1DataFetcher;
}());
// CLI Interface
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var args, fetcher, command, year, useCache, races, sessionKey, useCache, driverNumbers, data, loadedDrivers, files, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    args = process.argv.slice(2);
                    fetcher = new F1DataFetcher();
                    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
                        console.log("\n\uD83C\uDFCE\uFE0F  F1 Data Fetcher CLI\n\nUsage:\n  npx tsx f1-fetcher.ts list <year> [--no-cache]       # List available races\n  npx tsx f1-fetcher.ts fetch <session_key> [drivers] [--no-cache]  # Fetch race data\n  npx tsx f1-fetcher.ts cached                         # List cached race files\n  npx tsx f1-fetcher.ts cache-info                     # Show cache information\n  npx tsx f1-fetcher.ts clear-cache                    # Clear all cache\n\nExamples:\n  npx tsx f1-fetcher.ts list 2023\n  npx tsx f1-fetcher.ts list 2023 --no-cache           # Force fresh API call\n  npx tsx f1-fetcher.ts fetch 9161                     # Fetch all drivers\n  npx tsx f1-fetcher.ts fetch 9161 1,44,81             # Fetch specific drivers\n  npx tsx f1-fetcher.ts fetch 9161 --no-cache          # Bypass cache\n  npx tsx f1-fetcher.ts cached\n  npx tsx f1-fetcher.ts cache-info\n  npx tsx f1-fetcher.ts clear-cache\n\nCache:\n  - Race lists cached in .cache/races_<year>.json\n  - Driver lists cached in .cache/drivers_<session_key>.json\n  - Race data saved in ./f1_data/\n    ");
                        return [2 /*return*/];
                    }
                    command = args[0];
                    console.log("command: ", command);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 7, , 8]);
                    if (!(command === 'list')) return [3 /*break*/, 3];
                    year = parseInt(args[1] || '2023');
                    useCache = !args.includes('--no-cache');
                    return [4 /*yield*/, fetcher.listRaces(year, useCache)];
                case 2:
                    races = _a.sent();
                    races.forEach(function (race, idx) {
                        var date = new Date(race.date_start).toLocaleDateString();
                        console.log("".concat(idx + 1, ". ").concat(race.location, " (").concat(race.country_name, ")"));
                        console.log("   Session Key: ".concat(race.session_key));
                        console.log("   Date: ".concat(date, "\n"));
                    });
                    return [3 /*break*/, 6];
                case 3:
                    if (!(command === 'fetch')) return [3 /*break*/, 5];
                    sessionKey = parseInt(args[1]);
                    if (!sessionKey) {
                        console.error('❌ Error: session_key is required');
                        return [2 /*return*/];
                    }
                    useCache = !args.includes('--no-cache');
                    driverNumbers = void 0;
                    // Check if second arg is drivers or flag
                    if (args[2] && !args[2].startsWith('--')) {
                        driverNumbers = args[2].split(',').map(function (n) { return parseInt(n.trim()); });
                        console.log("\uD83C\uDFAF Fetching specific drivers: ".concat(driverNumbers.join(', ')));
                    }
                    return [4 /*yield*/, fetcher.fetchRaceData(sessionKey, driverNumbers, useCache)];
                case 4:
                    data = _a.sent();
                    loadedDrivers = Object.keys(data.locationData).length;
                    if (loadedDrivers === 0) {
                        console.warn('\n⚠️  No location loaded — not saving empty file');
                    }
                    else {
                        fetcher.saveToFile(data);
                        console.log('\n✅ Done!');
                    }
                    return [3 /*break*/, 6];
                case 5:
                    if (command === 'cached') {
                        files = fetcher.listCachedFiles();
                        if (files.length === 0) {
                            console.log('\n📭 No cached files found');
                        }
                        else {
                            console.log("\n\uD83D\uDCDA Cached race files (".concat(files.length, "):\n"));
                            files.forEach(function (file, idx) {
                                var filepath = path.join(fetcher.getDataDir(), file);
                                var sizeMB = (fs.statSync(filepath).size / (1024 * 1024)).toFixed(2);
                                console.log("".concat(idx + 1, ". ").concat(file, " (").concat(sizeMB, " MB)"));
                            });
                        }
                    }
                    else if (command === 'cache-info') {
                        fetcher.showCacheInfo();
                    }
                    else if (command === 'clear-cache') {
                        fetcher.clearCache();
                    }
                    else {
                        console.error("\u274C Unknown command: ".concat(command));
                        console.log('Run with --help for usage information');
                    }
                    _a.label = 6;
                case 6: return [3 /*break*/, 8];
                case 7:
                    error_2 = _a.sent();
                    console.error('\n❌ Error:', error_2 instanceof Error ? error_2.message : 'Unknown error');
                    process.exit(1);
                    return [3 /*break*/, 8];
                case 8: return [2 /*return*/];
            }
        });
    });
}
main();
