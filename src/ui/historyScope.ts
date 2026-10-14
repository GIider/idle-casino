import { h, toggleClass } from './dom';

export type HistoryScope = 'all' | 'prestige' | 'ascension';

const SCOPES: { id: HistoryScope; label: string; title: string }[] = [
  { id: 'all', label: 'All time', title: 'Every round across all ascensions' },
  { id: 'ascension', label: 'Ascension', title: 'Rounds since your last ascension' },
  { id: 'prestige', label: 'Prestige', title: 'Rounds since this table last prestiged' },
];

const KEY = 'idle-casino-history-scope';
const listeners = new Set<() => void>();

function load(): HistoryScope {
  try {
    const id = localStorage.getItem(KEY);
    return SCOPES.find((s) => s.id === id)?.id ?? 'all';
  } catch {
    return 'all';
  }
}

let current = load();

/** The shared scope of the unique history cards (one preference for every table). */
export function historyScope(): HistoryScope {
  return current;
}

/** The scope actually shown: the ascension scope is unavailable until the player has ascended once. */
export function effectiveScope(ascensions: number): HistoryScope {
  return current === 'ascension' && ascensions < 1 ? 'prestige' : current;
}

/** A segmented All time / Ascension / Prestige selector; every instance stays in sync. */
export function historyScopeSelector(onChange: () => void): { root: HTMLElement; setAscensions(n: number): void } {
  const buttons = SCOPES.map((s) => h('button', { class: 'btn small', text: s.label, title: s.title, onclick: () => select(s.id) }));
  const root = h('div', { class: 'history-range history-scope' }, ...buttons);
  let ascensions = 0;
  const sync = (): void => {
    SCOPES.forEach((s, i) => {
      toggleClass(buttons[i], 'active', s.id === effectiveScope(ascensions));
      if (s.id === 'ascension') toggleClass(buttons[i], 'hidden', ascensions < 1);
    });
  };
  listeners.add(() => {
    sync();
    onChange();
  });
  sync();
  return {
    root,
    setAscensions(n: number) {
      if (n === ascensions) return;
      ascensions = n;
      sync();
    },
  };
}

function select(id: HistoryScope): void {
  current = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* preference only */
  }
  listeners.forEach((fn) => fn());
}
