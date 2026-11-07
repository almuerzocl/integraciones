import type { Pool } from 'pg';

// Acceso a las conexiones del restaurante. Nada de aquí devuelve credenciales: ni siquiera cifradas.

export interface ConexionVista {
  id: string;
  proveedor: string;
  estado: 'activa' | 'pausada' | 'con_error';
  ultimo_sync_ok_at: Date | null;
  ultimo_error: string | null;
  errores_consecutivos: number;
}

export interface EjecucionVista {
  inicio: Date;
  resultado: 'en_curso' | 'ok' | 'error';
  creados: number;
  actualizados: number;
  ocultados: number;
  reactivados: number;
  ajustes_stock: number;
  error: string | null;
}

export async function obtenerConexion(pool: Pool, restaurantId: string, proveedor: string): Promise<ConexionVista | null> {
  const { rows } = await pool.query<ConexionVista>(
    `select id, proveedor, estado, ultimo_sync_ok_at, ultimo_error, errores_consecutivos
       from integraciones.conexiones where restaurant_id = $1 and proveedor = $2`, [restaurantId, proveedor]);
  return rows[0] ?? null;
}

export async function ultimasEjecuciones(pool: Pool, conexionId: string, limite = 5): Promise<EjecucionVista[]> {
  const { rows } = await pool.query<EjecucionVista>(
    `select inicio, resultado, creados, actualizados, ocultados, reactivados, ajustes_stock, error
       from integraciones.ejecuciones where conexion_id = $1 order by inicio desc limit $2`, [conexionId, limite]);
  return rows;
}

export async function ultimoInicio(pool: Pool, conexionId: string): Promise<Date | null> {
  const { rows } = await pool.query<{ inicio: Date }>(
    'select inicio from integraciones.ejecuciones where conexion_id = $1 order by inicio desc limit 1', [conexionId]);
  return rows[0]?.inicio ?? null;
}

/** Crea la conexión o reemplaza sus credenciales (queda activa y sin errores). */
export async function guardarConexion(pool: Pool, restaurantId: string, proveedor: string, cifradas: Buffer, userId: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into integraciones.conexiones (restaurant_id, proveedor, credenciales_cifradas, creada_por)
     values ($1, $2, $3, $4)
     on conflict (restaurant_id, proveedor) do update
       set credenciales_cifradas = excluded.credenciales_cifradas, creada_por = excluded.creada_por,
           estado = 'activa', ultimo_error = null, errores_consecutivos = 0, updated_at = now()
     returning id`, [restaurantId, proveedor, cifradas, userId]);
  return rows[0].id;
}

export async function cambiarEstado(pool: Pool, restaurantId: string, proveedor: string, estado: 'activa' | 'pausada'): Promise<boolean> {
  const { rowCount } = await pool.query(
    `update integraciones.conexiones set estado = $3, errores_consecutivos = case when $3 = 'activa' then 0 else errores_consecutivos end, updated_at = now()
      where restaurant_id = $1 and proveedor = $2`, [restaurantId, proveedor, estado]);
  return (rowCount ?? 0) > 0;
}

export async function eliminarConexion(pool: Pool, restaurantId: string, proveedor: string): Promise<boolean> {
  const { rowCount } = await pool.query('delete from integraciones.conexiones where restaurant_id = $1 and proveedor = $2', [restaurantId, proveedor]);
  return (rowCount ?? 0) > 0;
}
