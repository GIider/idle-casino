type Attrs = {
  class?: string;
  text?: string;
  title?: string;
  type?: string;
  value?: string;
  min?: string;
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

export function setDisabled(el: HTMLButtonElement | HTMLInputElement | HTMLSelectElement, v: boolean): void {
  if (el.disabled !== v) el.disabled = v;
}

export function toggleClass(el: HTMLElement, cls: string, on: boolean): void {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}

/** Restarts a CSS animation class. */
export function flash(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
