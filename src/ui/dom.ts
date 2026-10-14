type Attrs = {
  class?: string;
  text?: string;
  title?: string;
  href?: string;
  target?: string;
  rel?: string;
  type?: string;
  value?: string;
  min?: string;
  max?: string;
  step?: string;
  disabled?: boolean;
  onclick?: (e: MouseEvent) => void;
  onchange?: (e: Event) => void;
  oninput?: (e: Event) => void;
};

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  const { class: cls, text, onclick, onchange, oninput, ...rest } = attrs;
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  for (const [k, v] of Object.entries(rest)) {
    if (v === undefined) continue;
    if (k === 'disabled' || k === 'value') (el as any)[k] = v;
    else el.setAttribute(k, String(v));
  }
  if (onclick) el.addEventListener('click', onclick as EventListener);
  if (onchange) el.addEventListener('change', onchange);
  if (oninput) el.addEventListener('input', oninput);
  for (const c of children) el.append(c);
  return el;
}

export function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

/** Shows `lines` as stacked rows inside `el`, touching the DOM only when they change. */
export type BuyLine = { text: string; short?: boolean };

/** One span per line; `short` marks a currency you don't have enough of, `ok: false` styling otherwise only when a flag is given. */
export function setLines(el: HTMLElement, input: (string | BuyLine)[]): void {
  const lines: BuyLine[] = input.map((l) => (typeof l === 'string' ? { text: l } : l));
  const key = lines.map((l) => `${l.short === undefined ? '' : l.short ? '!' : '+'}${l.text}`).join('\n');
  if (el.dataset.lines === key) return;
  el.dataset.lines = key;
  el.replaceChildren(...lines.map((l, i) => {
    const row = document.createElement('span');
    row.className = (i === 0 ? 'buy-line' : 'buy-line tie') + (l.short === undefined ? '' : l.short ? ' short' : ' ok');
    row.textContent = l.text;
    return row;
  }));
}

export function setDisabled(el: HTMLButtonElement | HTMLInputElement | HTMLSelectElement, v: boolean): void {
  if (el.disabled !== v) el.disabled = v;
}

export function toggleClass(el: HTMLElement, cls: string, on: boolean): void {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}

/** Sets a row's `--fill` (0..1) and the `started`/`maxed` classes, touching the DOM only when the level changed. */
export function setFill(el: HTMLElement, level: number, maxLevel: number): void {
  const ratio = maxLevel > 0 ? Math.max(0, Math.min(1, level / maxLevel)) : 0;
  const key = String(ratio);
  if (el.dataset.fill === key) return;
  el.dataset.fill = key;
  el.style.setProperty('--fill', key);
  toggleClass(el, 'started', level > 0);
  toggleClass(el, 'maxed', level >= maxLevel);
}
