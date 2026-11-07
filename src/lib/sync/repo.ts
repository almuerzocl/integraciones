import type { Pool } from 'pg';
import type { Almuerzo, PlatoVinculado, StockVisto } from './motor';

// Acceso a datos. Hacia almuerzo.cl SOLO se llaman las funciones integracion_*; hacia el esquema propio, SQL normal.

export function almuerzoPg(pool: Pool, restaurantId: string, origen: string): Almuerzo {
  return {
    async upsertCategoria(nombre) {
      const { rows } = await pool.query<{ id: string }>('select public.integracion_upsert_categoria($1, $2) as id', [restaurantId, nombre]);
      return rows[0].id;
    },
    async upsertPlato(p) {
      const { rows } = await pool.query<{ r: { id: string; created: boolean } }>(
        'select public.integracion_upsert_plato($1, $2, $3, $4, $5, $6, $7, $8) as r',
        [restaurantId, origen, p.externalId, p.nombre, p.descripcion, p.precio, p.categoriaId, p.stockManaged],
      );
      return rows[0].r;
    },
    async setVisible(platoId, visible) {
      const { rows } = await pool.query<{ r: boolean }>('select public.integracion_set_visible($1, $2) as r', [platoId, visible]);
      return rows[0].r;
    },
    async ajustarStock(platoId, previo, nuevo) {
      const { rows } = await pool.query<{ r: { changed: boolean } }>('select public.integracion_ajustar_stock($1, $2, $3) as r', [platoId, previo, nuevo]);
      return rows[0].r;
    },
    async listarPlatos() {
      const { rows } = await pool.query<PlatoVinculado>(
        'select id, external_id, stock_managed, hidden_by_integration from public.integracion_listar_platos($1, $2)', [restaurantId, origen]);
      return rows;
    },
  };
}

export function stockVistoPg(pool: Pool, conexionId: string): StockVisto {
  return {
    async leer() {
      const { rows } = await pool.query<{ external_id: string; stock: number }>('select external_id, stock from integraciones.stock_visto where conexion_id = $1', [conexionId]);
      return new Map(rows.map((r) => [r.external_id, r.stock]));
    },
    async guardar(externalId, stock) {
      await pool.query(
        `insert into integraciones.stock_visto (conexion_id, external_id, stock) values ($1, $2, $3)
         on conflict (conexion_id, external_id) do update set stock = excluded.stock, updated_at = now()`, [conexionId, externalId, stock]);
    },
    async borrar(externalId) {
      await pool.query('delete from integraciones.stock_visto where conexion_id = $1 and external_id = $2', [conexionId, externalId]);
    },
  };
}
