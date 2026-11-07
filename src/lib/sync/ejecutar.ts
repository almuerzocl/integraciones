import type { Pool } from 'pg';
import { credentialAad, decryptSecret, parseKey } from '../crypto';
import { env } from '../env';
import { FudoCliente } from '../fudo/cliente';
import { sincronizar, type Resumen } from './motor';
import { almuerzoPg, stockVistoPg } from './repo';

export interface Conexion {
  id: string;
  restaurant_id: string;
  proveedor: string;
  credenciales_cifradas: Buffer;
}

export type Resultado = { conexionId: string; estado: 'ok' | 'error' | 'ocupada'; resumen?: Resumen; error?: string };

const ERRORES_PARA_MARCAR = 3;
const recortar = (s: string) => s.slice(0, 300);

/** Sincroniza UNA conexión. Una sola corrida a la vez por conexión (lock en la base); el resto sale como 'ocupada'. */
export async function ejecutarConexion(pool: Pool, c: Conexion): Promise<Resultado> {
  const lock = await pool.connect();
  try {
    await lock.query('begin');
    const { rows } = await lock.query<{ ok: boolean }>('select pg_try_advisory_xact_lock(hashtextextended($1, 0)) as ok', [`integraciones:${c.id}`]);
    if (!rows[0].ok) return { conexionId: c.id, estado: 'ocupada' };

    const ej = await pool.query<{ id: string }>('insert into integraciones.ejecuciones (conexion_id) values ($1) returning id', [c.id]);
    const ejecucionId = ej.rows[0].id;
    try {
      const clave = parseKey(env.credentialsKey);
      const cred = JSON.parse(decryptSecret(c.credenciales_cifradas, clave, credentialAad(c.restaurant_id, c.proveedor))) as { apiKey: string; apiSecret: string };
      const fudo = new FudoCliente(cred.apiKey, cred.apiSecret);
      const productos = await fudo.listarProductosActivos();
      const r = await sincronizar(productos, almuerzoPg(pool, c.restaurant_id, c.proveedor), stockVistoPg(pool, c.id));

      if (r.fallidos > 0) throw Object.assign(new Error(`${r.fallidos} producto(s) con error: ${r.errores.join('; ')}`), { resumen: r });
      await pool.query(
        `update integraciones.ejecuciones set fin = now(), resultado = 'ok', creados = $2, actualizados = $3, ocultados = $4, reactivados = $5, ajustes_stock = $6 where id = $1`,
        [ejecucionId, r.creados, r.actualizados, r.ocultados, r.reactivados, r.ajustesStock]);
      await pool.query(
        `update integraciones.conexiones set estado = 'activa', ultimo_sync_ok_at = now(), ultimo_error = null, errores_consecutivos = 0, updated_at = now() where id = $1`, [c.id]);
      return { conexionId: c.id, estado: 'ok', resumen: r };
    } catch (e) {
      const mensaje = recortar(e instanceof Error ? e.message : String(e));
      const r = (e as { resumen?: Resumen }).resumen;
      await pool.query(
        `update integraciones.ejecuciones set fin = now(), resultado = 'error', error = $2, creados = $3, actualizados = $4, ocultados = $5, reactivados = $6, ajustes_stock = $7 where id = $1`,
        [ejecucionId, mensaje, r?.creados ?? 0, r?.actualizados ?? 0, r?.ocultados ?? 0, r?.reactivados ?? 0, r?.ajustesStock ?? 0]);
      await pool.query(
        `update integraciones.conexiones set ultimo_error = $2, errores_consecutivos = errores_consecutivos + 1,
           estado = case when errores_consecutivos + 1 >= $3 then 'con_error' else estado end, updated_at = now() where id = $1`,
        [c.id, mensaje, ERRORES_PARA_MARCAR]);
      return { conexionId: c.id, estado: 'error', error: mensaje, resumen: r };
    }
  } finally {
    await lock.query('commit').catch(() => {});
    lock.release();
  }
}

/** Todas las conexiones no pausadas, una tras otra, con un tope de tiempo total. */
export async function ejecutarTodas(pool: Pool, presupuestoMs = 100_000): Promise<Resultado[]> {
  const { rows } = await pool.query<Conexion>(
    `select id, restaurant_id, proveedor, credenciales_cifradas from integraciones.conexiones where estado in ('activa', 'con_error') and proveedor = 'fudo' order by ultimo_sync_ok_at nulls first`);
  const inicio = Date.now();
  const out: Resultado[] = [];
  for (const c of rows) {
    if (Date.now() - inicio > presupuestoMs) break; // las que faltan van primero en la próxima corrida (orden por último sync)
    out.push(await ejecutarConexion(pool, c));
  }
  return out;
}
