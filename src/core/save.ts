import type { GameState } from './types';
import { createInitialState, normalizeState } from './state';

export const SAVE_KEY = 'idle-casino-save';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStore(): Store | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveGame(state: GameState, store: Store | null = defaultStore()): boolean {
  if (!store) return false;
  try {
    state.lastSaved = Date.now();
    store.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(store: Store | null = defaultStore()): GameState | null {
  if (!store) return null;
  try {
    const text = store.getItem(SAVE_KEY);
    if (!text) return null;
    return normalizeState(JSON.parse(text));
  } catch {
    return null;
  }
}

export function clearSave(store: Store | null = defaultStore()): void {
  try {
    store?.removeItem(SAVE_KEY);
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
