import './styles/main.css';
import { Game } from './core/game';
import { clearSave, freshGame, importSave, loadGame, saveGame } from './core/save';
import { normalizeState } from './core/state';
import { App } from './ui/app';
import { applyQuality } from './ui/quality';
import { fmt, fmtDuration } from './ui/format';

applyQuality();
const host = document.querySelector<HTMLDivElement>('#app')!;
const TICK_MS = 100;
const OFFLINE_THRESHOLD_SECONDS = 30;

let game: Game;
let app: App;
let lastTick = performance.now();

function start(state = loadGame() ?? freshGame(), offline = true): void {
  game = new Game(normalizeState(state));
  app = new App(host, game, {
    onImport(text) {
      const imported = importSave(text);
      saveGame(imported);
      start(imported, false);
      app.toast('Save imported.');
    },
    onReset() {
      clearSave();
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
          `Welcome back! In ${fmtDuration(away)} away your auto-players made ${fmt(report.plays)} plays and ${sign} ${fmt(Math.abs(report.net))}.`,
          10000,
        );
      }
    }
  }
  app.update();
}

setInterval(() => {
  const now = performance.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;
  if (dt > 5) {
    // The tab was suspended; treat the gap like time spent away.
    game.applyOffline(dt);
  } else {
    game.tick(dt);
  }
  app.update();
}, TICK_MS);

setInterval(() => saveGame(game.state), 5000);
window.addEventListener('beforeunload', () => saveGame(game.state));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveGame(game.state);
});

start();
