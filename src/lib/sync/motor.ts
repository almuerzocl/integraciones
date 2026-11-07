import type { FudoProducto } from '../fudo/cliente';

// Motor de sincronización: compara la carta VIGENTE del sistema externo con los platos ya vinculados en almuerzo.cl y
// aplica los cambios por las funciones integracion_*. No conoce HTTP ni SQL: todo entra por interfaces (se prueba con fakes).
//
// Reglas (acordadas con el negocio):
//   - Se cargan todos los productos vigentes, tengan o no control de stock.
//   - Un producto que deja de estar vigente se OCULTA (no se borra); si vuelve, se reactiva.
//   - Stock: del externo hacia almuerzo.cl, solo la DIFERENCIA (lo decide integracion_ajustar_stock en la base).
//   - Las categorías se crean con el nombre del externo.
//   - Salvaguarda: una respuesta vacía o que ocultaría de golpe gran parte de la carta se trata como falla, no como verdad.

export interface PlatoVinculado {
  id: string;
  external_id: string;
  stock_managed: boolean;
  hidden_by_integration: boolean;
}

export interface Almuerzo {
  upsertCategoria(nombre: string): Promise<string>;
  upsertPlato(p: { externalId: string; nombre: string; descripcion: string | null; precio: number; categoriaId: string; stockManaged: boolean }): Promise<{ id: string; created: boolean }>;
  setVisible(platoId: string, visible: boolean): Promise<boolean>;
  ajustarStock(platoId: string, previo: number, nuevo: number): Promise<{ changed: boolean }>;
  listarPlatos(): Promise<PlatoVinculado[]>;
}

export interface StockVisto {
  leer(): Promise<Map<string, number>>;
  guardar(externalId: string, stock: number): Promise<void>;
  borrar(externalId: string): Promise<void>;
}

export interface Resumen {
  productos: number;
  creados: number;
  actualizados: number;
  ocultados: number;
  reactivados: number;
  ajustesStock: number;
  fallidos: number;
  errores: string[];
}

export class SincronizacionAbortada extends Error {}

export const CATEGORIA_POR_DEFECTO = 'Sin categoría';
const UMBRAL_MINIMO_OCULTOS = 5;

export async function sincronizar(productos: FudoProducto[], almuerzo: Almuerzo, visto: StockVisto): Promise<Resumen> {
  const r: Resumen = { productos: productos.length, creados: 0, actualizados: 0, ocultados: 0, reactivados: 0, ajustesStock: 0, fallidos: 0, errores: [] };
  const existentes = await almuerzo.listarPlatos();
  const porExterno = new Map(existentes.map((p) => [p.external_id, p]));
  const vigentes = new Set(productos.map((p) => p.id));

  // Salvaguarda antes de tocar nada.
  const visibles = existentes.filter((p) => !p.hidden_by_integration);
  const aOcultar = visibles.filter((p) => !vigentes.has(p.external_id));
  if (productos.length === 0 && visibles.length > 0) {
    throw new SincronizacionAbortada('FUDO devolvió una carta vacía; no se ocultó nada por seguridad');
  }
  if (aOcultar.length > UMBRAL_MINIMO_OCULTOS && aOcultar.length > visibles.length / 2) {
    throw new SincronizacionAbortada(`La sincronización ocultaría ${aOcultar.length} de ${visibles.length} platos; se detuvo por seguridad`);
  }

  const stockVisto = await visto.leer();
  const categorias = new Map<string, string>();
  const falla = (que: string, e: unknown) => {
    r.fallidos++;
    if (r.errores.length < 5) r.errores.push(`${que}: ${e instanceof Error ? e.message : String(e)}`);
  };

  for (const p of productos) {
    try {
      const nombreCat = p.categoriaNombre?.trim() || CATEGORIA_POR_DEFECTO;
      let categoriaId = categorias.get(nombreCat.toLowerCase());
      if (!categoriaId) {
        categoriaId = await almuerzo.upsertCategoria(nombreCat);
        categorias.set(nombreCat.toLowerCase(), categoriaId);
      }

      const previo = porExterno.get(p.id);
      const { id, created } = await almuerzo.upsertPlato({
        externalId: p.id, nombre: p.nombre, descripcion: p.descripcion, precio: Math.max(0, Math.round(p.precio)),
        categoriaId, stockManaged: p.stockControl,
      });
      if (created) r.creados++; else r.actualizados++;

      if (previo?.hidden_by_integration) {
        if (await almuerzo.setVisible(id, true)) r.reactivados++;
      }

      if (p.stockControl) {
        const nuevo = Math.max(0, Math.floor(p.stock ?? 0));
        // Si el plato recién pasó a tener control de stock, el último valor conocido no vale: parte de 0.
        const conocido = created || previo?.stock_managed === false ? undefined : stockVisto.get(p.id);
        const anterior = conocido ?? 0;
        if (conocido === undefined || conocido !== nuevo) {
          const res = await almuerzo.ajustarStock(id, anterior, nuevo);
          if (res.changed) r.ajustesStock++;
          await visto.guardar(p.id, nuevo);
        }
      } else if (stockVisto.has(p.id)) {
        await visto.borrar(p.id);
      }
    } catch (e) {
      falla(`producto ${p.id}`, e);
    }
  }

  for (const p of aOcultar) {
    try {
      if (await almuerzo.setVisible(p.id, false)) r.ocultados++;
    } catch (e) {
      falla(`ocultar ${p.external_id}`, e);
    }
  }
  return r;
}
