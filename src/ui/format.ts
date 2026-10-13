const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/** Compact number formatting: 1,234 -> 1.23K, 1e15 -> 1.00Qa, beyond that scientific. */
export function fmt(n: number, decimals = 0): string {
  if (!Number.isFinite(n)) return '∞';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs < 1000) return sign + (decimals > 0 ? abs.toFixed(decimals) : String(Math.floor(abs)));
  const tier = Math.floor(Math.log10(abs) / 3);
  if (tier >= SUFFIXES.length) return sign + abs.toExponential(2).replace('+', '');
  return sign + (abs / 1000 ** tier).toFixed(2) + SUFFIXES[tier];
}

export function fmtSigned(n: number): string {
  return (n > 0 ? '+' : n < 0 ? '' : '±') + fmt(n);
}

export function fmtDuration(seconds: number): string {
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const hrs = Math.floor(m / 60);
  return `${hrs}h ${m % 60}m`;
}
