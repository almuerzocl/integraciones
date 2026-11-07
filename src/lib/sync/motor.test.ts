import { describe, expect, it } from 'vitest';
import type { FudoProducto } from '../fudo/cliente';
import { sincronizar, SincronizacionAbortada, type Almuerzo, type PlatoVinculado, type StockVisto } from './motor';

const prod = (id: string, extra: Partial<FudoProducto> = {}): FudoProducto => ({
  id, nombre: `Plato ${id}`, descripcion: null, precio: 5000, stockControl: false, stock: null, categoriaId: '1', categoriaNombre: 'Fondos', ...extra,
});

function mundo(inicial: PlatoVinculado[] = [], stockInicial: Record<string, number> = {}) {
  const platos = new Map(inicial.map((p) => [p.external_id, { ...p }]));
  const vistoMap = new Map(Object.entries(stockInicial));
  const llamadas: string[] = [];
  let n = 0;
  const falla = new Set<string>();
  const almuerzo: Almuerzo = {
    async upsertCategoria(nombre) { llamadas.push(`cat:${nombre}`); return `cat-${nombre}`; },
    async upsertPlato(p) {
      llamadas.push(`plato:${p.externalId}:${p.stockManaged}`);
      if (falla.has(p.externalId)) throw new Error('boom');
      const ex = platos.get(p.externalId);
      if (ex) { ex.stock_managed = p.stockManaged; return { id: ex.id, created: false }; }
      const id = `id-${++n}`;
      platos.set(p.externalId, { id, external_id: p.externalId, stock_managed: p.stockManaged, hidden_by_integration: false });
      return { id, created: true };
    },
    async setVisible(id, v) {
      llamadas.push(`visible:${id}:${v}`);
      const p = [...platos.values()].find((x) => x.id === id)!;
      if (p.hidden_by_integration === !v) return false;
      p.hidden_by_integration = !v; return true;
    },
    async ajustarStock(id, a, b) { llamadas.push(`stock:${id}:${a}->${b}`); return { changed: a !== b }; },
    async listarPlatos() { return [...platos.values()].map((p) => ({ ...p })); },
  };
  const visto: StockVisto = {
    async leer() { return new Map(vistoMap); },
    async guardar(e, s) { vistoMap.set(e, s); },
    async borrar(e) { vistoMap.delete(e); },
  };
  return { almuerzo, visto, platos, vistoMap, llamadas, falla };
}
const vinc = (ext: string, extra: Partial<PlatoVinculado> = {}): PlatoVinculado => ({ id: `id-${ext}`, external_id: ext, stock_managed: false, hidden_by_integration: false, ...extra });

describe('sincronizar', () => {
  it('primera carga: crea categorías y platos, con y sin control de stock', async () => {
    const m = mundo();
    const r = await sincronizar([prod('1'), prod('2', { stockControl: true, stock: 10 }), prod('3', { categoriaNombre: 'Postres' })], m.almuerzo, m.visto);
    expect(r).toMatchObject({ productos: 3, creados: 3, actualizados: 0, ocultados: 0, ajustesStock: 1, fallidos: 0 });
    expect(m.llamadas.filter((l) => l.startsWith('cat:'))).toEqual(['cat:Fondos', 'cat:Postres']);
    expect(m.llamadas).toContain('stock:id-2:0->10');
    expect(m.vistoMap.get('2')).toBe(10);
    expect(m.vistoMap.has('1')).toBe(false);
  });
  it('segunda corrida sin cambios no toca el stock', async () => {
    const m = mundo();
    await sincronizar([prod('2', { stockControl: true, stock: 10 })], m.almuerzo, m.visto);
    const antes = m.llamadas.length;
    const r = await sincronizar([prod('2', { stockControl: true, stock: 10 })], m.almuerzo, m.visto);
    expect(r).toMatchObject({ creados: 0, actualizados: 1, ajustesStock: 0 });
    expect(m.llamadas.slice(antes).some((l) => l.startsWith('stock:'))).toBe(false);
  });
  it('cambio de stock en el externo: se envía previo y nuevo', async () => {
    const m = mundo([vinc('2', { stock_managed: true })], { '2': 10 });
    await sincronizar([prod('2', { stockControl: true, stock: 8 })], m.almuerzo, m.visto);
    expect(m.llamadas).toContain('stock:id-2:10->8');
    expect(m.vistoMap.get('2')).toBe(8);
  });
  it('stock decimal o negativo se normaliza', async () => {
    const m = mundo();
    await sincronizar([prod('1', { stockControl: true, stock: 7.9 }), prod('2', { stockControl: true, stock: -3 }), prod('3', { stockControl: true, stock: null })], m.almuerzo, m.visto);
    expect(m.llamadas).toContain('stock:id-1:0->7');
    expect(m.llamadas).toContain('stock:id-2:0->0');
    expect(m.llamadas).toContain('stock:id-3:0->0');
  });
  it('producto que pasa a tener control de stock parte de 0', async () => {
    const m = mundo([vinc('1', { stock_managed: false })], { '1': 99 });
    await sincronizar([prod('1', { stockControl: true, stock: 4 })], m.almuerzo, m.visto);
    expect(m.llamadas).toContain('stock:id-1:0->4');
  });
  it('producto que deja el control de stock olvida su stock visto', async () => {
    const m = mundo([vinc('1', { stock_managed: true })], { '1': 5 });
    await sincronizar([prod('1', { stockControl: false })], m.almuerzo, m.visto);
    expect(m.vistoMap.has('1')).toBe(false);
  });
  it('oculta lo que dejó de estar vigente y no toca lo ya oculto', async () => {
    const m = mundo([vinc('1'), vinc('2'), vinc('3', { hidden_by_integration: true })]);
    const r = await sincronizar([prod('1')], m.almuerzo, m.visto);
    expect(r.ocultados).toBe(1);
    expect(m.platos.get('2')!.hidden_by_integration).toBe(true);
    expect(m.llamadas).not.toContain('visible:id-3:false');
  });
  it('reactiva un plato oculto que vuelve a estar vigente', async () => {
    const m = mundo([vinc('1', { hidden_by_integration: true })]);
    const r = await sincronizar([prod('1')], m.almuerzo, m.visto);
    expect(r.reactivados).toBe(1);
    expect(m.platos.get('1')!.hidden_by_integration).toBe(false);
  });
  it('salvaguarda: carta vacía no oculta nada', async () => {
    const m = mundo([vinc('1'), vinc('2')]);
    await expect(sincronizar([], m.almuerzo, m.visto)).rejects.toBeInstanceOf(SincronizacionAbortada);
    expect([...m.platos.values()].every((p) => !p.hidden_by_integration)).toBe(true);
  });
  it('carta vacía y sin platos previos es válida', async () => {
    const m = mundo();
    expect((await sincronizar([], m.almuerzo, m.visto)).productos).toBe(0);
  });
  it('salvaguarda: ocultar más de la mitad (y más de 5) aborta', async () => {
    const m = mundo(Array.from({ length: 12 }, (_, i) => vinc(String(i + 1))));
    await expect(sincronizar([prod('1'), prod('2')], m.almuerzo, m.visto)).rejects.toThrow(/ocultaría 10 de 12/);
    expect([...m.platos.values()].every((p) => !p.hidden_by_integration)).toBe(true);
  });
  it('ocultar pocos platos de una carta chica sí se permite', async () => {
    const m = mundo([vinc('1'), vinc('2'), vinc('3')]);
    expect((await sincronizar([prod('1')], m.almuerzo, m.visto)).ocultados).toBe(2);
  });
  it('un producto que falla no detiene a los demás', async () => {
    const m = mundo();
    m.falla.add('2');
    const r = await sincronizar([prod('1'), prod('2'), prod('3')], m.almuerzo, m.visto);
    expect(r).toMatchObject({ creados: 2, fallidos: 1 });
    expect(r.errores[0]).toContain('producto 2');
  });
  it('categoría sin nombre usa la categoría por defecto', async () => {
    const m = mundo();
    await sincronizar([prod('1', { categoriaNombre: null, categoriaId: null })], m.almuerzo, m.visto);
    expect(m.llamadas).toContain('cat:Sin categoría');
  });
  it('la categoría se resuelve una sola vez por nombre', async () => {
    const m = mundo();
    await sincronizar([prod('1'), prod('2'), prod('3', { categoriaNombre: 'FONDOS' })], m.almuerzo, m.visto);
    expect(m.llamadas.filter((l) => l.startsWith('cat:')).length).toBe(1);
  });
  it('precio decimal se redondea y el negativo queda en 0', async () => {
    const m = mundo();
    const vistos: number[] = [];
    const orig = m.almuerzo.upsertPlato;
    m.almuerzo.upsertPlato = async (p) => { vistos.push(p.precio); return orig(p); };
    await sincronizar([prod('1', { precio: 5499.6 }), prod('2', { precio: -5 })], m.almuerzo, m.visto);
    expect(vistos).toEqual([5500, 0]);
  });
});
