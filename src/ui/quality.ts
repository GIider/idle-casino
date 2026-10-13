/** Render quality: 'low' drops decorative effects via <html data-quality="low"> (see main.css). */
export type Quality = 'auto' | 'high' | 'low';
const KEY = 'idle-casino:quality';

function stored(): Quality {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'high' || v === 'low') return v;
  } catch {
    /* storage unavailable */
  }
  return 'auto';
}

function detectLow(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 2;
}

export function applyQuality(q: Quality = stored()): Quality {
  const low = q === 'low' || (q === 'auto' && detectLow());
  document.documentElement.dataset.quality = low ? 'low' : 'high';
  return q;
}

export function cycleQuality(): Quality {
  const order: Quality[] = ['auto', 'high', 'low'];
  const next = order[(order.indexOf(stored()) + 1) % order.length];
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* ignore */
  }
  return applyQuality(next);
}

let probeFrames = 0;
let probeSum = 0;

/** Feed rAF frame gaps (ms) while the stage animates; flips auto mode to low if the device struggles. */
export function probeFrame(ms: number): void {
  if (probeFrames >= 60 || ms > 250 || stored() !== 'auto') return;
  probeFrames++;
  probeSum += ms;
  if (probeFrames === 60 && probeSum / 60 > 24) document.documentElement.dataset.quality = 'low';
}
