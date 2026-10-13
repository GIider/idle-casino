// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { createInitialState } from '../src/core/state';
import { mulberry32 } from '../src/core/rng';
import { App } from '../src/ui/app';

describe('UI smoke', () => {
  it('renders every table and reacts to play/unlock', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const game = new Game(createInitialState(0), mulberry32(3));
    const app = new App(host, game, { onImport() {}, onReset() {} });
    app.update();
    expect(host.querySelectorAll('.tab').length).toBe(5); // 4 tables + casino
    expect(host.querySelector('.money')!.textContent).toBe('100');

    (host.querySelector('.btn.play') as HTMLButtonElement).click();
    app.update();
    expect(game.table('coinflip').plays).toBe(1);
    expect(host.querySelector('.result')!.textContent).toMatch(/Heads|Tails/);

    game.state.money = 1e6;
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
