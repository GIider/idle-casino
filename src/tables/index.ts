import type { TableDef, TableId } from '../core/types';
import { coinflip } from './coinflip';
import { slots } from './slots';
import { roulette } from './roulette';
import { blackjack } from './blackjack';

export const TABLE_IDS: TableId[] = ['coinflip', 'slots', 'roulette', 'blackjack'];

export const TABLES: Record<TableId, TableDef> = { coinflip, slots, roulette, blackjack };

/** The table whose currency pays for unlocking `id` (null for the first table). */
export function previousTable(id: TableId): TableId | null {
  const i = TABLE_IDS.indexOf(id);
  return i > 0 ? TABLE_IDS[i - 1] : null;
}

/** The last table in the chain; its wallet gates ascension. */
export const FINAL_TABLE: TableId = TABLE_IDS[TABLE_IDS.length - 1];
