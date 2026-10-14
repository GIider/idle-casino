/** Dev-only profiling overlay, enabled with `?perf=1`. Costs nothing (two cheap calls) when disabled. */
export const perfOn = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('perf') === '1';

interface Stat {
  calls: number;
  total: number;
  max: number;
}

const WINDOW_MS = 1000;
let stats = new Map<string, Stat>();
let frames = 0;

/** Starts a measurement; pair with `perfEnd`. */
export function perfBegin(): number {
  return perfOn ? performance.now() : 0;
}

export function perfEnd(label: string, start: number): void {
  if (!perfOn) return;
  const ms = performance.now() - start;
  let s = stats.get(label);
  if (!s) stats.set(label, (s = { calls: 0, total: 0, max: 0 }));
  s.calls++;
  s.total += ms;
  if (ms > s.max) s.max = ms;
}

/** Shows per-second call counts, average/max ms, and total ms spent per second for every measured label. */
export function mountPerfOverlay(): void {
  if (!perfOn) return;
  const el = document.createElement('pre');
  el.style.cssText =
    'position:fixed;right:8px;bottom:8px;z-index:9999;margin:0;padding:6px 8px;font:11px/1.35 monospace;' +
    'background:rgba(0,0,0,.8);color:#9f9;border-radius:6px;pointer-events:none;white-space:pre';
  document.body.append(el);
  const count = (): void => {
    frames++;
    requestAnimationFrame(count);
  };
  requestAnimationFrame(count);
  let since = performance.now();
  window.setInterval(() => {
    const now = performance.now();
    const secs = (now - since) / 1000;
    since = now;
    const rows = [...stats].sort((a, b) => b[1].total - a[1].total);
    const lines = [`fps ${(frames / secs).toFixed(0)}   quality ${document.documentElement.dataset.quality ?? '?'}`];
    lines.push('label            calls/s  avg ms  max ms  ms/s');
    for (const [label, s] of rows) {
      lines.push(
        `${label.padEnd(16)} ${(s.calls / secs).toFixed(0).padStart(7)} ${(s.total / s.calls).toFixed(2).padStart(7)} ${s.max.toFixed(2).padStart(7)} ${(s.total / secs).toFixed(1).padStart(5)}`,
      );
    }
    el.textContent = lines.join('\n');
    stats = new Map();
    frames = 0;
  }, WINDOW_MS);
}
