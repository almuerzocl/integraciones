import { describe, expect, it } from 'vitest';
import { buscarIntegracion, estadoDe, INTEGRACIONES } from './catalogo';

describe('catálogo', () => {
  it('los id son únicos, en minúsculas y aptos para URL', () => {
    const ids = INTEGRACIONES.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });
  it('los proveedores son únicos y válidos para la base', () => {
    const p = INTEGRACIONES.map((i) => i.proveedor);
    expect(new Set(p).size).toBe(p.length);
    for (const x of p) expect(x).toMatch(/^[a-z0-9_]{2,30}$/);
  });
  it('no choca con rutas reservadas', () => {
    for (const i of INTEGRACIONES) expect(['login', 'sin-permiso', 'api']).not.toContain(i.id);
  });
  it('busca por id', () => {
    expect(buscarIntegracion('fudo')?.nombre).toBe('FUDO');
    expect(buscarIntegracion('nada')).toBeUndefined();
  });
  it('estado: sin conexión o el de la conexión', () => {
    expect(estadoDe(null)).toBe('sin_conexion');
    expect(estadoDe(undefined)).toBe('sin_conexion');
    expect(estadoDe({ estado: 'con_error' })).toBe('con_error');
  });
});
