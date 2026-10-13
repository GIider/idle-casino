import type { BuyMode } from '../core/economy';
import { h, toggleClass } from './dom';

interface ModeDef extends BuyMode {
  id: string;
  label: string;
}

export const BUY_MODES: ModeDef[] = [
  { id: '1', label: '×1', cap: 1, fraction: 1 },
  { id: '10', label: '×10', cap: 10, fraction: 1 },
  { id: '50', label: '50%', cap: Infinity, fraction: 0.5 },
  { id: 'max', label: 'Max', cap: Infinity, fraction: 1 },
];

const KEY = 'idle-casino-buy-mode';
const listeners = new Set<() => void>();

function load(): ModeDef {
  try {
    const id = localStorage.getItem(KEY);
    return BUY_MODES.find((m) => m.id === id) ?? BUY_MODES[0];
  } catch {
    return BUY_MODES[0];
  }
}

let current = load();

/** The shared buy mode (one preference for every table's upgrades and the casino shop). */
export function buyMode(): ModeDef {
  return current;
}

/** A segmented ×1 / ×10 / 50% / Max selector; every instance stays in sync. */
export function buyModeSelector(): HTMLElement {
  const buttons = BUY_MODES.map((m) => h('button', { class: 'btn small', text: m.label, title: modeTitle(m), onclick: () => select(m) }));
  const root = h('div', { class: 'history-range buy-modes' }, ...buttons);
  const sync = (): void => BUY_MODES.forEach((m, i) => toggleClass(buttons[i], 'active', m === current));
  listeners.add(sync);
  sync();
  return root;
}

function select(m: ModeDef): void {
  current = m;
  try {
    localStorage.setItem(KEY, m.id);
  } catch {
    /* preference only */
  }
  listeners.forEach((fn) => fn());
}

function modeTitle(m: ModeDef): string {
  if (m.id === 'max') return 'Buy as many levels as you can afford';
  if (m.fraction < 1) return 'Buy as many levels as fit in half of your currency';
  return `Buy up to ${m.cap} level${m.cap === 1 ? '' : 's'}`;
}

/** Button label: `×N · cost`, the next level's cost when nothing is affordable. */
export function buyLabel(count: number, cost: number, nextCost: number, fmt: (n: number) => string, unit = ''): string {
  const u = unit ? ` ${unit}` : '';
  return count > 0 ? `×${count} · ${fmt(cost)}${u}` : `${fmt(nextCost)}${u}`;
}
