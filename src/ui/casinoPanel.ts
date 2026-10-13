import type { Game } from '../core/game';
import { TABLES, FINAL_TABLE } from '../tables';
import { casinoValue } from '../core/state';
import { CASINO_UPGRADES, ascensionThreshold, casinoUpgradeCost, type CasinoUpgradeDef } from '../core/casino';
import { h, setDisabled, setText, toggleClass } from './dom';
import { fmt } from './format';
import { BankrollChart } from './bankrollChart';

interface Row {
  def: CasinoUpgradeDef;
  level: HTMLElement;
  button: HTMLButtonElement;
}

/** Casino-wide meta layer: ascend for chips, spend chips on permanent upgrades. */
export class CasinoPanel {
  readonly root: HTMLElement;
  private chipsEl: HTMLElement;
  private ascendText: HTMLElement;
  private ascendBar: HTMLElement;
  private ascendBtn: HTMLButtonElement;
  private rows: Row[] = [];
  private bankroll = new BankrollChart();

  constructor(private game: Game) {
    this.chipsEl = h('div', { class: 'chips', text: '0' });
    this.ascendText = h('div', { class: 'prestige-text' });
    this.ascendBar = h('div', { class: 'bar-fill' });
    this.ascendBtn = h('button', {
      class: 'btn prestige',
      text: 'Ascend',
      onclick: () => {
        const reward = game.ascendReward();
        if (
          game.canAscend() &&
          window.confirm(
            `Ascend? Every table, upgrade, prestige level and wallet reset (table history too; the casino value graph is kept). You earn ${reward} casino chip${reward === 1 ? '' : 's'}.`,
          )
        ) {
          game.ascend();
        }
      },
    });

    const shop = h('div', { class: 'card upgrades' }, h('h3', { text: 'Casino shop' }));
    for (const def of CASINO_UPGRADES) {
      const level = h('span', { class: 'level' });
      const button = h('button', { class: 'btn buy', onclick: () => game.buyCasinoUpgrade(def.id) });
      shop.append(
        h(
          'div',
          { class: 'upgrade' },
          h('div', { class: 'upgrade-text' }, h('div', {}, h('strong', { text: def.name }), ' ', level), h('small', { text: def.description })),
          button,
        ),
      );
      this.rows.push({ def, level, button });
    }

    this.root = h(
      'section',
      { class: 'panel' },
      h(
        'div',
        { class: 'table-body' },
        h(
          'div',
          { class: 'col main' },
          h(
            'div',
            { class: 'card header-card' },
            h('h2', { text: '🏛 The Casino' }),
            h('p', { text: 'Ascend to reset the whole floor for casino chips, then spend them on upgrades that apply to every table, forever.' }),
            h('div', { class: 'stats' }, h('span', { text: 'Chips: ' }), this.chipsEl),
          ),
          h('div', { class: 'card' }, h('h3', { text: 'Ascension' }), this.ascendText, h('div', { class: 'bar' }, this.ascendBar), this.ascendBtn),
          this.bankroll.root,
        ),
        h('div', { class: 'col side' }, shop),
      ),
    );
  }

  update(): void {
    const { game } = this;
    const casino = game.state.casino;
    setText(this.chipsEl, `${fmt(casino.chips)} (${fmt(casino.totalChips)} earned · ${casino.ascensions} ascensions)`);

    const threshold = ascensionThreshold(casino.ascensions);
    const money = game.state.tables[FINAL_TABLE].wallet;
    const currency = TABLES[FINAL_TABLE].currency;
    setText(
      this.ascendText,
      game.canAscend()
        ? `Ready: ascending now earns ${fmt(game.ascendReward())} chips. Earn more first for +3 chips per 10× above ${fmt(threshold)} ${currency.name}.`
        : `Reach ${fmt(threshold)} ${currency.name} at ${TABLES[FINAL_TABLE].name} to ascend (${fmt(money)} now).`,
    );
    this.ascendBar.style.width = `${(Math.max(0, Math.min(1, money / threshold)) * 100).toFixed(1)}%`;
    setDisabled(this.ascendBtn, !game.canAscend());
    this.bankroll.update(game.state.bankroll, casinoValue(game.state.tables));

    for (const row of this.rows) {
      const level = game.casinoLevel(row.def.id);
      setText(row.level, `Lv ${level}/${row.def.maxLevel}`);
      if (level >= row.def.maxLevel) {
        setText(row.button, 'Maxed');
        setDisabled(row.button, true);
      } else {
        const cost = casinoUpgradeCost(row.def, level);
        setText(row.button, `${fmt(cost)} chips`);
        setDisabled(row.button, casino.chips < cost);
      }
    }
  }

  setHidden(hidden: boolean): void {
    toggleClass(this.root, 'hidden', hidden);
  }
}
