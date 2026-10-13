import type { Game } from '../core/game';
import { TABLES, FINAL_TABLE } from '../tables';
import { casinoValue } from '../core/state';
import {
  ASCENSION_WINNINGS_BONUS,
  CASINO_UPGRADES,
  MANAGER_RESERVE_BETS,
  ascensionMultiplier,
  ascensionThreshold,
  managerInterval,
  type CasinoUpgradeDef,
} from '../core/casino';
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
  private bonusEl: HTMLElement;
  private managerEl: HTMLElement;
  private autoPrestige: HTMLLabelElement;
  private autoPrestigeBox: HTMLInputElement;
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
            `Ascend? Every table, upgrade, prestige level and wallet reset (table history too; the casino value graph is kept). You earn ${reward} casino chip${reward === 1 ? '' : 's'} and winnings ×${ASCENSION_WINNINGS_BONUS} on every table, permanently.`,
          )
        ) {
          game.ascend();
        }
      },
    });

    this.bonusEl = h('p', { class: 'auto-info' });
    this.managerEl = h('p', { class: 'auto-info' });
    this.autoPrestigeBox = h('input', {
      type: 'checkbox',
      onchange: () => game.setAutoPrestige(this.autoPrestigeBox.checked),
    });
    this.autoPrestige = h(
      'label',
      { class: 'auto-buy hidden' },
      this.autoPrestigeBox,
      ' Auto-prestige tables as soon as they can',
    );

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
          h(
            'div',
            { class: 'card' },
            h('h3', { text: 'Ascension' }),
            this.bonusEl,
            this.ascendText,
            h('div', { class: 'bar' }, this.ascendBar),
            this.ascendBtn,
          ),
          h('div', { class: 'card' }, h('h3', { text: 'Floor Manager' }), this.managerEl, this.autoPrestige),
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

    setText(
      this.bonusEl,
      `Ascension bonus: winnings ×${fmt(ascensionMultiplier(casino.ascensions), 2)} on every table (×${fmt(ascensionMultiplier(casino.ascensions + 1), 2)} after the next ascension).`,
    );
    const manager = game.casinoLevel('manager');
    const interval = managerInterval(manager, game.casinoLevel('overtime'));
    setText(
      this.managerEl,
      interval > 0
        ? `Buys the cheapest affordable upgrade at every table every ${interval}s, keeping ${MANAGER_RESERVE_BETS} minimum bets in reserve.`
        : 'Buy the Floor Manager in the shop below to have upgrades purchased for you.',
    );
    toggleClass(this.autoPrestige, 'hidden', game.casinoLevel('concierge') < 1);
    if (this.autoPrestigeBox.checked !== casino.autoPrestige) this.autoPrestigeBox.checked = casino.autoPrestige;

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
        const cost = game.casinoUpgradeCostFor(row.def, level);
        const req = row.def.requires;
        const locked = req !== undefined && game.casinoLevel(req.id) < req.level;
        const reqName = req ? CASINO_UPGRADES.find((u) => u.id === req.id)?.name : '';
        setText(row.button, locked ? `Needs ${reqName}` : `${fmt(cost)} chips`);
        setDisabled(row.button, locked || casino.chips < cost);
      }
    }
  }

  setHidden(hidden: boolean): void {
    toggleClass(this.root, 'hidden', hidden);
  }
}
