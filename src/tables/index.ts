import type { TableDef, TableId } from '../core/types';
import { coinflip } from './coinflip';
import { slots } from './slots';
import { roulette } from './roulette';
import { blackjack } from './blackjack';

export const TABLE_IDS: TableId[] = ['coinflip', 'slots', 'roulette', 'blackjack'];

export const TABLES: Record<TableId, TableDef> = { coinflip, slots, roulette, blackjack };
