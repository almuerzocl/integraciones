import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import type { Pool } from 'pg';
import { cambiarEstado, eliminarConexion, guardarConexion, obtenerConexion, ultimasEjecuciones } from './conexiones';

const R1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const R2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
let db: PGlite;
let pool: Pool;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create role integraciones_service nologin;
    create table public.restaurants(id uuid primary key);
    insert into public.restaurants values ('${R1}'), ('${R2}');
  `);
  await db.exec(readFileSync(join(__dirname, '..', '..', 'migrations', '001_esquema_integraciones.sql'), 'utf8'));
  await db.exec('set role integraciones_service');
  // PGlite informa las filas afectadas como `affectedRows`; pg.Pool las informa como `rowCount`.
  pool = { query: async (t: string, p?: unknown[]) => { const r = await db.query(t, p); return { ...r, rowCount: r.affectedRows ?? r.rows.length }; } } as unknown as Pool;
});

describe('conexiones', () => {
  it('guardar crea y devuelve la vista sin credenciales', async () => {
    await guardarConexion(pool, R1, 'fudo', Buffer.from('cifrado'), '11111111-1111-1111-1111-111111111111');
    const c = await obtenerConexion(pool, R1, 'fudo');
    expect(c).toMatchObject({ proveedor: 'fudo', estado: 'activa', errores_consecutivos: 0 });
    expect(Object.keys(c!)).not.toContain('credenciales_cifradas');
  });
  it('cada restaurante ve solo la suya', async () => {
    expect(await obtenerConexion(pool, R2, 'fudo')).toBeNull();
  });
  it('guardar de nuevo reemplaza credenciales y limpia el error', async () => {
    await db.exec(`update integraciones.conexiones set estado='con_error', ultimo_error='x', errores_consecutivos=4`);
    const id1 = (await obtenerConexion(pool, R1, 'fudo'))!.id;
    const id2 = await guardarConexion(pool, R1, 'fudo', Buffer.from('nuevo'), '11111111-1111-1111-1111-111111111111');
    expect(id2).toBe(id1);
    expect(await obtenerConexion(pool, R1, 'fudo')).toMatchObject({ estado: 'activa', ultimo_error: null, errores_consecutivos: 0 });
    const raw = await db.query<{ credenciales_cifradas: Uint8Array }>(`select credenciales_cifradas from integraciones.conexiones`);
    expect(Buffer.from(raw.rows[0].credenciales_cifradas).toString()).toBe('nuevo');
  });
  it('pausar y reanudar solo afectan al restaurante indicado', async () => {
    await guardarConexion(pool, R2, 'fudo', Buffer.from('x'), '22222222-2222-2222-2222-222222222222');
    expect(await cambiarEstado(pool, R1, 'fudo', 'pausada')).toBe(true);
    expect((await obtenerConexion(pool, R1, 'fudo'))!.estado).toBe('pausada');
    expect((await obtenerConexion(pool, R2, 'fudo'))!.estado).toBe('activa');
    expect(await cambiarEstado(pool, R1, 'fudo', 'activa')).toBe(true);
    expect(await cambiarEstado(pool, R1, 'otro', 'activa')).toBe(false);
  });
  it('lista las últimas ejecuciones, la más reciente primero', async () => {
    const id = (await obtenerConexion(pool, R1, 'fudo'))!.id;
    await db.exec(`insert into integraciones.ejecuciones(conexion_id, inicio, resultado) values ('${id}', now() - interval '2 min', 'ok'), ('${id}', now() - interval '1 min', 'error')`);
    const e = await ultimasEjecuciones(pool, id, 5);
    expect(e.map((x) => x.resultado)).toEqual(['error', 'ok']);
  });
  it('eliminar borra la conexión y su historial, solo la del restaurante indicado', async () => {
    expect(await eliminarConexion(pool, R1, 'fudo')).toBe(true);
    expect(await obtenerConexion(pool, R1, 'fudo')).toBeNull();
    expect(await obtenerConexion(pool, R2, 'fudo')).not.toBeNull();
    expect(await eliminarConexion(pool, R1, 'fudo')).toBe(false);
  });
});
