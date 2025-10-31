```
# show help
npx tsx f1-fetcher.ts --help

# npm script (passes args after --)
npm run start -- --help

# list races for a year (cache allowed)
npx tsx f1-fetcher.ts list 2023

# list races forcing fresh API call (no cache)
npx tsx f1-fetcher.ts list 2023 --no-cache

# fetch all drivers for a session (replace 9161 with a real session_key)
npx tsx f1-fetcher.ts fetch 9161

# fetch specific drivers (comma-separated)
npx tsx f1-fetcher.ts fetch 9161 1,44,81

# fetch specific drivers and bypass cache
npx tsx f1-fetcher.ts fetch 9161 1,44,81 --no-cache

# run via npm script and bypass cache
npm run start -- fetch 9161 --no-cache

# list saved race files
npx tsx f1-fetcher.ts cached

# show cache file info
npx tsx f1-fetcher.ts cache-info

# clear all cache
    npx tsx f1-fetcher.ts clear-cache

# try another year
npx tsx f1-fetcher.ts list 2024

# simulate an error (invalid session key) to test error handling
npx tsx f1-fetcher.ts fetch 999999

```