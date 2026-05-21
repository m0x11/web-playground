// Shared cycle stepping — used by Media (image cycle) and Text (line cycle).
//
// Given how many steps have elapsed, returns the index to show. Direction:
//   forward   — 0,1,2,…,n-1,0,1,…
//   backward  — 0,n-1,n-2,…,1,0,…
//   ping-pong — 0,1,…,n-1,n-2,…,1,0,1,… (endpoints hit once per period)

export function cycleIndex(step, n, dir = 'forward', start = 0) {
  if (n <= 1) return 0;
  if (dir === 'ping-pong') {
    const period = 2 * (n - 1);
    const pos = (((start + step) % period) + period) % period;
    return pos < n ? pos : period - pos;
  }
  const s = dir === 'backward' ? start - step : start + step;
  return ((s % n) + n) % n;
}

// Seconds for one full cycle period — what the timeline needs to show it all.
export function cyclePeriodSeconds(n, speed, dir = 'forward') {
  if (n <= 1) return 0;
  const steps = dir === 'ping-pong' ? 2 * (n - 1) : n;
  return steps * Math.max(0.001, speed);
}
