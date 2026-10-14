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

describe('dev mode', () => {
  it('has no unlock button and devUnlockAll unlocks everything and allows ascending', () => {
    window.history.pushState({}, '', '/?cardcounting=1');
    const host = document.createElement('div');
    document.body.append(host);
    const game = new Game(createInitialState(0), mulberry32(3));
    new App(host, game, { onImport() {}, onReset() {} });
    expect(Array.from(host.querySelectorAll('button')).some((b) => b.textContent?.includes('Unlock everything'))).toBe(false);
    expect(game.freeCasinoShop).toBe(true);
    game.devUnlockAll();
    expect(game.table('blackjack').unlocked).toBe(true);
    expect(game.canAscend()).toBe(true);
    window.history.pushState({}, '', '/');
  });
});

describe('achievements page', () => {
  it('lists achievements only for unlocked tables and filters by status', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const game = new Game(createInitialState(0), mulberry32(3));
    const app = new App(host, game, { onImport() {}, onReset() {} });
    const tab = Array.from(host.querySelectorAll('.tab')).find((t) => t.getAttribute('title') === 'Achievements') as HTMLButtonElement;
    tab.click();
    app.update();
    const visible = TABLE_IDS.filter((id) => game.table(id).unlocked);
    const expected = visible.reduce((n, id) => n + achievementsFor(id).length, 0);
    const titles = host.querySelectorAll('.ach-section .ach-card');
    expect(titles.length).toBe(expected);
    expect(host.querySelector('.ach-summary')!.textContent).toContain(' achievements unlocked');

    const done = Array.from(host.querySelectorAll('.ach-filters button')).find((b) => b.textContent === 'Completed (0)') as HTMLButtonElement;
    done.click();
    expect(host.querySelectorAll('.ach-section .ach-card').length).toBe(0);
    expect(host.textContent).toContain('Nothing matches');

    const button = (label: string) =>
      Array.from(host.querySelectorAll('.ach-filters button')).find((b) => b.textContent?.startsWith(label)) as HTMLButtonElement;
    button('All (').click();
    const grind = visible.reduce((n, id) => n + achievementsFor(id).filter((d) => d.kind === 'grind').length, 0);
    expect(button('Grind (').textContent).toBe(`Grind (${grind})`);
    button('Grind (').click();
    expect(host.querySelectorAll('.ach-section .ach-card').length).toBe(grind);
  });
});

describe('achievement unlock indicator', () => {
  it('badges the tab and card until the card is hovered', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const game = new Game(createInitialState(0), mulberry32(3));
    const app = new App(host, game, { onImport() {}, onReset() {} });
    const p = game.state.achievements.hotHand;
    p.unlocked = true;
    p.seen = false;
    app.update();
    const tab = Array.from(host.querySelectorAll('.tab')).find((t) => t.getAttribute('title') === 'Achievements') as HTMLButtonElement;
    const badge = tab.querySelector('.tab-badge')!;
    expect(badge.classList.contains('hidden')).toBe(false);
    expect(badge.textContent).toBe('1');
    tab.click();
    app.update();
    const card = host.querySelector('.ach-card.new')!;
    expect(card.querySelector('.ach-new')).not.toBeNull();
    const newBtn = Array.from(host.querySelectorAll('.ach-filters button')).find((b) => b.textContent?.startsWith('New (')) as HTMLButtonElement;
    expect(newBtn.textContent).toBe('New (1)');
    newBtn.click();
    expect(host.querySelectorAll('.ach-section .ach-card').length).toBe(1);
    card.dispatchEvent(new Event('mouseenter'));
    expect(card.classList.contains('new')).toBe(false);
    expect(p.seen).toBe(true);
    tab.click();
    app.update();
    expect(host.querySelectorAll('.ach-section .ach-card').length).toBe(1); // stays listed under New
    tab.click(); // resets the slow-update throttle
    app.update();
    expect(badge.classList.contains('hidden')).toBe(true);
  });
});
