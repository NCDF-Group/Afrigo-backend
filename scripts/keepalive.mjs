const url = process.env.KEEPALIVE_URL ?? 'https://afrigo-backend-arv3.onrender.com/api/v1/health/live'
const intervalMs = Number(process.env.KEEPALIVE_INTERVAL_SECONDS ?? 15) * 1000
const timeoutMs = 60_000

const stamp = () => new Date().toLocaleTimeString()
let failures = 0
let running = false

async function ping() {
  if (running) return
  running = true
  const started = Date.now()
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': 'afrigo-keepalive' } })
    const ms = Date.now() - started
    if (response.ok) {
      if (failures > 0 || ms > 5000) console.log(`${stamp()}  awake  ${response.status}  ${ms}ms${ms > 5000 ? '  (was asleep, woke up)' : ''}`)
      failures = 0
    } else {
      failures++
      console.log(`${stamp()}  error  HTTP ${response.status}  ${ms}ms`)
    }
  } catch (error) {
    failures++
    console.log(`${stamp()}  down   ${error instanceof Error ? error.message : error}`)
  } finally {
    running = false
  }
}

console.log(`${stamp()}  Pinging ${url} every ${intervalMs / 1000}s. Press Ctrl+C to stop.`)
await ping()
console.log(`${stamp()}  first ping done, now running quietly (only problems and wake ups are printed)`)
setInterval(ping, intervalMs)
