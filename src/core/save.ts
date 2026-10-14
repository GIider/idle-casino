import type { GameState } from './types';
import { createInitialState, normalizeState } from './state';

export const SAVE_KEY = 'idle-casino-save';
/** Dev mode keeps its own save so it never touches the regular one. */
export const DEV_SAVE_KEY = 'idle-casino-save-dev';

/** Dev mode: the page was opened with `?cardcounting=1`. */
export function devMode(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('cardcounting') === '1';
  } catch {
    return false;
  }
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStore(): Store | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveGame(state: GameState, store: Store | null = defaultStore(), key = SAVE_KEY): boolean {
  if (!store) return false;
  try {
    state.lastSaved = Date.now();
    store.setItem(key, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(store: Store | null = defaultStore(), key = SAVE_KEY): GameState | null {
  if (!store) return null;
  try {
    const text = store.getItem(key);
    if (!text) return null;
    return normalizeState(JSON.parse(text));
  } catch {
    return null;
  }
}

export function clearSave(store: Store | null = defaultStore(), key = SAVE_KEY): void {
  try {
    store?.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function exportSave(state: GameState): string {
  return btoa(JSON.stringify(state));
}

export function importSave(text: string): GameState {
  const trimmed = text.trim();
  let json: unknown;
  try {
    json = JSON.parse(atob(trimmed));
  } catch {
    try {
      json = JSON.parse(trimmed);
    } catch {
      throw new Error('That does not look like a save');
    }
  }
  const state = normalizeState(json);
  state.lastSaved = Date.now();
  return state;
}

export function freshGame(): GameState {
  return createInitialState();
}
