// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { createInitialState } from '../src/core/state';
import { mulberry32 } from '../src/core/rng';
import { App } from '../src/ui/app';
import { TABLE_IDS } from '../src/tables';
import { achievementsFor } from '../src/core/achievements';

describe('UI smoke', () => {
  it('renders every table and reacts to play/unlock', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const game = new Game(createInitialState(0), mulberry32(3));
    const app = new App(host, game, { onImport() {}, onReset() {} });
    app.update();
    expect(host.querySelectorAll('.tab').length).toBe(6); // 4 tables + casino + achievements
    expect(host.querySelector('.money')!.textContent).toBe('100');

    expect(host.querySelector('.btn.play')).toBeNull();
    expect(host.textContent).not.toContain('Unlock everything');
    game.tick(1);
    app.update();
    expect(game.table('coinflip').plays).toBe(1);
    expect(host.querySelector('.stage-canvas')!.getAttribute('aria-label')).toMatch(/Heads|Tails|Gold|edge/);
    expect(host.querySelector('.result')).toBeNull();

    game.table('coinflip').wallet = 1e6;
    (host.querySelectorAll('.tab')[1] as HTMLButtonElement).click();
    app.update();
    const unlock = host.querySelectorAll('.locked .btn')[1] as HTMLButtonElement;
    unlock.click();
    app.update();
    expect(game.table('slots').unlocked).toBe(true);

    game.tick(1);
    app.update();
    expect(host.textContent).toContain('Slots');
  });
});

describe('dev button', () => {
  it('only shows with ?cardcounting=1 and unlocks everything', () => {
    window.history.pushState({}, '', '/?cardcounting=1');
    const host = document.createElement('div');
    document.body.append(host);
    const game = new Game(createInitialState(0), mulberry32(3));
    const app = new App(host, game, { onImport() {}, onReset() {} });
    const btn = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes('Unlock everything'))!;
    expect(btn).toBeDefined();
    btn.click();
    app.update();
    expect(game.table('blackjack').unlocked).toBe(true);
    window.history.pushState({}, '', '/');
  });
});

describe('achievements page', () => {
  it('lists every achievement of discovered tables and filters by status', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const game = new Game(createInitialState(0), mulberry32(3));
    const app = new App(host, game, { onImport() {}, onReset() {} });
    const tab = Array.from(host.querySelectorAll('.tab')).find((t) => t.textContent?.includes('Achievements')) as HTMLButtonElement;
    tab.click();
    app.update();
    const visible = TABLE_IDS.filter((id) => game.tableVisible(id));
    const expected = visible.reduce((n, id) => n + achievementsFor(id).length, 0);
    const titles = host.querySelectorAll('.ach-section .ach-card');
    expect(titles.length).toBe(expected);
    expect(host.querySelector('.ach-summary')!.textContent).toContain(' tiers earned');

    const done = Array.from(host.querySelectorAll('.ach-filters button')).find((b) => b.textContent === 'Completed') as HTMLButtonElement;
    done.click();
    expect(host.querySelectorAll('.ach-section .ach-card').length).toBe(0);
    expect(host.textContent).toContain('Nothing matches');
  });
});
