/** Render quality: 'low' drops decorative effects via <html data-quality="low"> (see main.css) and the `profile` knobs below. */
export type Quality = 'auto' | 'high' | 'low';
const KEY = 'idle-casino:quality';

/** Tunables read by the hot paths. Mutated in place by `applyQuality`, so keep a reference rather than copying values. */
export interface Profile {
  low: boolean;
  /** Max device pixel ratio for canvases. */
  dprCap: number;
  maxParticles: number;
  /** Canvas `shadowBlur` glows (expensive in 2D contexts). */
  canvasShadows: boolean;
  /** Minimum ms between stage canvas frames (0 = every rAF). */
  stageFrameMs: number;
  /** Minimum ms between full UI (DOM) updates. */
  uiTickMs: number;
  /** Minimum ms between history chart repaints. */
  historyRefreshMs: number;
}

const HIGH: Profile = {
  low: false,
  dprCap: 1.5,
  maxParticles: 200,
  canvasShadows: true,
  stageFrameMs: 0,
  uiTickMs: 0,
  historyRefreshMs: 250,
};
const LOW: Profile = {
  low: true,
  dprCap: 1,
  maxParticles: 60,
  canvasShadows: false,
  // Slightly under 33 ms so a 60 Hz display (16.7 ms frames) lands on every other frame, i.e. ~30 fps.
  stageFrameMs: 30,
  uiTickMs: 250,
  historyRefreshMs: 750,
};

export const profile: Profile = { ...HIGH };

const listeners = new Set<(low: boolean) => void>();

/** Called whenever the resolved profile flips between high and low. Returns an unsubscribe function. */
export function onQualityChange(cb: (low: boolean) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function stored(): Quality {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'high' || v === 'low') return v;
  } catch {
    /* storage unavailable */
  }
  return 'auto';
}

/** `?quality=low|high` forces a mode for this page load without persisting (for A/B profiling). */
function urlOverride(): Quality | null {
  try {
    const v = new URLSearchParams(window.location.search).get('quality');
    return v === 'high' || v === 'low' ? v : null;
  } catch {
    return null;
  }
}

function detectLow(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 2;
}

function setResolved(low: boolean): void {
  const was = profile.low;
  Object.assign(profile, low ? LOW : HIGH);
  document.documentElement.dataset.quality = low ? 'low' : 'high';
  if (was !== low) for (const cb of listeners) cb(low);
}

/** The mode the user picked (auto/high/low); `resolved()` is what is actually in effect. */
let mode: Quality | null = null;
export function currentMode(): Quality {
  return mode ?? urlOverride() ?? stored();
}

export function resolved(): 'high' | 'low' {
  return profile.low ? 'low' : 'high';
}

/** Button label: the chosen mode, plus what auto resolved to. */
export function qualityLabel(): string {
  const m = currentMode();
  return m === 'auto' ? `Quality: auto (${resolved()})` : `Quality: ${m}`;
}

export function applyQuality(q: Quality = currentMode()): Quality {
  mode = q;
  setResolved(q === 'low' || (q === 'auto' && detectLow()));
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
  if (probeFrames >= 60 || ms > 250 || currentMode() !== 'auto') return;
  // A throttled low profile intentionally skips frames; only judge the full-rate one.
  if (profile.low) return;
  probeFrames++;
  probeSum += ms;
  if (probeFrames === 60 && probeSum / 60 > 24) setResolved(true);
}

/** Test hook: forget probe history. */
export function resetProbe(): void {
  mode = null;
  probeFrames = 0;
  probeSum = 0;
}
