// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { annotate, define, term } from '../src/ui/glossary';

describe('glossary', () => {
  it('wraps known terms in tooltip spans and keeps the rest as text', () => {
    const parts = annotate('A natural beats a Charlie, 3 free spins');
    const spans = parts.filter((p): p is HTMLElement => typeof p !== 'string');
    expect(spans.map((s) => s.textContent)).toEqual(['natural', 'Charlie', 'free spins']);
    expect(spans.every((s) => s.title.length > 10 && s.className === 'term')).toBe(true);
    expect(parts.map((p) => (typeof p === 'string' ? p : p.textContent)).join('')).toBe('A natural beats a Charlie, 3 free spins');
  });

  it('matches plurals and leaves unknown words alone', () => {
    expect(define('Charlies')).toBe(define('charlie'));
    expect(term('banana')).toBe('banana');
    expect(annotate('nothing here')).toEqual(['nothing here']);
  });
});
