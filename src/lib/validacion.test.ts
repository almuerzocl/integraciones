import { describe, expect, it } from 'vitest';
import { segundosParaSincronizar, validarCredenciales } from './validacion';

describe('validarCredenciales', () => {
  it('acepta y recorta', () => {
    expect(validarCredenciales(' abc ', ' def ')).toEqual({ ok: true, valor: { apiKey: 'abc', apiSecret: 'def' } });
  });
  it('rechaza vacías o no texto', () => {
    for (const [a, b] of [['', 'x'], ['x', ''], [null, 'x'], ['x', undefined], [1, 2]] as const) expect(validarCredenciales(a, b).ok).toBe(false);
  });
  it('rechaza espacios internos y largos excesivos', () => {
    expect(validarCredenciales('a b', 'c').ok).toBe(false);
    expect(validarCredenciales('a'.repeat(201), 'c').ok).toBe(false);
    expect(validarCredenciales('a', 'c'.repeat(501)).ok).toBe(false);
  });
});

describe('segundosParaSincronizar', () => {
  const t = new Date('2026-11-07T12:00:00Z');
  it('sin corridas previas se puede', () => expect(segundosParaSincronizar(null, t)).toBe(0));
  it('hace 10 s: faltan 50', () => expect(segundosParaSincronizar(new Date(t.getTime() - 10_000), t)).toBe(50));
  it('hace 61 s: se puede', () => expect(segundosParaSincronizar(new Date(t.getTime() - 61_000), t)).toBe(0));
});
