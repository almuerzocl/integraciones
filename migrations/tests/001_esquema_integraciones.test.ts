import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

// Prueba el esquema sobre PGlite con un stub mínimo de public.restaurants y de los roles de Supabase.
// No prueba los grants automáticos de Supabase: tras aplicar hay que verificarlos en la base real.

const R1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const R2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
let db: PGlite;

const asRole = async <T>(role: string, fn: () => Promise<T>): Promise<T> => {
  await db.exec(`set role ${role}`);
  try { return await fn(); } finally { await db.exec('reset role'); }
};
const falla = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create role integraciones_service nologin;
    create table public.restaurants(id uuid primary key);
    insert into public.restaurants values ('${R1}'), ('${R2}');
  `);
  await db.exec(readFileSync(join(__dirname, '..', '001_esquema_integraciones.sql'), 'utf8'));
});

describe('esquema integraciones', () => {
  it('el servicio puede crear y leer una conexión', async () => {
    await asRole('integraciones_service', () =>
      db.query(`insert into integraciones.conexiones(restaurant_id, proveedor, credenciales_cifradas) values ($1,'fudo','\\x01')`, [R1]));
    const r = await asRole('integraciones_service', () => db.query(`select proveedor, estado, errores_consecutivos from integraciones.conexiones`));
    expect(r.rows).toEqual([{ proveedor: 'fudo', estado: 'activa', errores_consecutivos: 0 }]);
  });
  it('una conexión por restaurante y proveedor', async () => {
    expect(await falla(() => asRole('integraciones_service', () =>
      db.query(`insert into integraciones.conexiones(restaurant_id, proveedor, credenciales_cifradas) values ($1,'fudo','\\x02')`, [R1])))).toBe(true);
    await asRole('integraciones_service', () =>
      db.query(`insert into integraciones.conexiones(restaurant_id, proveedor, credenciales_cifradas) values ($1,'fudo','\\x02')`, [R2]));
  });
  it('valida proveedor y estado', async () => {
    expect(await falla(() => db.query(`insert into integraciones.conexiones(restaurant_id, proveedor, credenciales_cifradas) values ($1,'Fudo!','\\x01')`, [R2]))).toBe(true);
    expect(await falla(() => db.query(`update integraciones.conexiones set estado='x'`))).toBe(true);
  });
  it('stock visto: no admite negativos y es único por plato', async () => {
    const { rows } = await db.query<{ id: string }>(`select id from integraciones.conexiones where restaurant_id=$1`, [R1]);
    const id = rows[0].id;
    await asRole('integraciones_service', () => db.query(`insert into integraciones.stock_visto(conexion_id, external_id, stock) values ($1,'F-1',5)`, [id]));
    expect(await falla(() => asRole('integraciones_service', () => db.query(`insert into integraciones.stock_visto(conexion_id, external_id, stock) values ($1,'F-1',6)`, [id])))).toBe(true);
    expect(await falla(() => asRole('integraciones_service', () => db.query(`insert into integraciones.stock_visto(conexion_id, external_id, stock) values ($1,'F-2',-1)`, [id])))).toBe(true);
  });
  it('borrar la conexión borra su historial y su stock visto', async () => {
    const { rows } = await db.query<{ id: string }>(`select id from integraciones.conexiones where restaurant_id=$1`, [R1]);
    await db.query(`insert into integraciones.ejecuciones(conexion_id) values ($1)`, [rows[0].id]);
    await db.query(`delete from integraciones.conexiones where id=$1`, [rows[0].id]);
    expect((await db.query(`select 1 from integraciones.ejecuciones`)).rows.length).toBe(0);
    expect((await db.query(`select 1 from integraciones.stock_visto`)).rows.length).toBe(0);
  });
  it('anon, authenticated y service_role no tienen acceso', async () => {
    for (const rol of ['anon', 'authenticated', 'service_role']) {
      expect(await falla(() => asRole(rol, () => db.query(`select * from integraciones.conexiones`)))).toBe(true);
      expect(await falla(() => asRole(rol, () => db.query(`select * from integraciones.stock_visto`)))).toBe(true);
    }
  });
});
