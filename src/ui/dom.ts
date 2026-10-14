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
export function setLines(el: HTMLElement, lines: string[]): void {
  const key = lines.join('\n');
  if (el.dataset.lines === key) return;
  el.dataset.lines = key;
  el.replaceChildren(...lines.map((text, i) => {
    const row = document.createElement('span');
    row.className = i === 0 ? 'buy-line' : 'buy-line tie';
    row.textContent = text;
    return row;
  }));
}

export function setDisabled(el: HTMLButtonElement | HTMLInputElement | HTMLSelectElement, v: boolean): void {
  if (el.disabled !== v) el.disabled = v;
}

export function toggleClass(el: HTMLElement, cls: string, on: boolean): void {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}
