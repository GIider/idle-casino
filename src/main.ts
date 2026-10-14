import './styles/main.css';
import { Game } from './core/game';
import { DEV_SAVE_KEY, SAVE_KEY, clearSave, devMode, freshGame, importSave, loadGame, saveGame } from './core/save';
import { normalizeState } from './core/state';
import type { GameState } from './core/types';
import { App } from './ui/app';
import { applyQuality, profile } from './ui/quality';
import { mountPerfOverlay, perfBegin, perfEnd } from './ui/perf';
import { fmt, fmtDuration } from './ui/format';

applyQuality();
const host = document.querySelector<HTMLDivElement>('#app')!;
const TICK_MS = 100;
const OFFLINE_THRESHOLD_SECONDS = 30;

const KEY = devMode() ? DEV_SAVE_KEY : SAVE_KEY;
const persist = (state: GameState): boolean => saveGame(state, undefined, KEY);

let game: Game;
let app: App;
let lastTick = performance.now();

function start(state = loadGame(undefined, KEY) ?? freshGame(), offline = true): void {
  game = new Game(normalizeState(state));
  if (devMode()) game.devUnlockAll();
  app = new App(host, game, {
    onImport(text) {
      const imported = importSave(text);
      persist(imported);
      start(imported, false);
      app.toast('Save imported.');
    },
    onReset() {
      clearSave(undefined, KEY);
      start(freshGame(), false);
    },
  });
  lastTick = performance.now();

  if (offline) {
    const away = (Date.now() - game.state.lastSaved) / 1000;
    if (away > OFFLINE_THRESHOLD_SECONDS) {
      const report = game.applyOffline(away);
      if (report.plays > 0) {
        const sign = report.net >= 0 ? 'won' : 'lost';
        app.toast(
          `Welcome back! In ${fmtDuration(away)} away your tables made ${fmt(report.plays)} plays and ${sign} ${fmt(Math.abs(report.net))}.`,
          10000,
        );
      }
    }
  }
  if (!document.hidden) app.update();
}

let lastUi = 0;
setInterval(() => {
  const now = performance.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;
  const t0 = perfBegin();
  if (dt > 5) {
    // The tab was suspended; treat the gap like time spent away.
    game.applyOffline(dt);
  } else {
    game.tick(dt);
  }
  perfEnd('game.tick', t0);
  // Simulation ticks every time; the DOM refresh is rate-limited on low quality.
  if (now - lastUi >= profile.uiTickMs) {
    lastUi = now;
    const t1 = perfBegin();
    app.update();
    perfEnd('app.update', t1);
  }
}, TICK_MS);

setInterval(() => persist(game.state), 5000);
window.addEventListener('beforeunload', () => persist(game.state));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persist(game.state);
});

start();
mountPerfOverlay();
