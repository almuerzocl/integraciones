import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import type { Pool } from 'pg';
import { credentialAad, encryptSecret } from '../../src/lib/crypto';
import { ejecutarConexion } from '../../src/lib/sync/ejecutar';

// Prueba de punta a punta: motor + repo + funciones REALES de la migración 060 + esquema propio, sobre PGlite.
// Necesita las migraciones de v5-pwa:  PWA_MIGRATIONS_DIR=/ruta/a/v5-pwa/migrations npm test
// Sin esa variable se omite (el repositorio no depende de otro para compilar).
const DIR = process.env.PWA_MIGRATIONS_DIR;
const R1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const clave = randomBytes(32);
let db: PGlite;
let conexionId = '';
let respuestaFudo: { data: unknown[]; included: unknown[] };

// pg.Pool mínimo sobre PGlite (una sola conexión: no prueba concurrencia).
const pool = {
  query: (t: string, p?: unknown[]) => db.query(t, p),
  connect: async () => ({ query: (t: string, p?: unknown[]) => db.query(t, p), release: () => {} }),
} as unknown as Pool;

const prod = (id: number, nombre: string, extra: Record<string, unknown> = {}) => ({
  id: String(id), type: 'Product', attributes: { name: nombre, price: 5000, active: true, stockControl: false, ...extra },
  relationships: { productCategory: { data: { id: '10', type: 'ProductCategory' } } },
});
const categorias = [{ id: '10', type: 'ProductCategory', attributes: { name: 'Fondos' } }];
// Lectura de verificación como superusuario (el servicio NO puede leer menu_items); luego vuelve al rol del servicio.
const estado = async () => {
  await db.exec('reset role');
  try {
    return (await db.query<{ external_id: string; name: string; is_available: boolean; hidden_by_integration: boolean; current_stock: number; stock_managed: boolean }>(
      `select external_id, name, is_available, hidden_by_integration, current_stock, stock_managed from menu_items where integration_source='fudo' order by external_id`)).rows;
  } finally { await db.exec('set role integraciones_service'); }
};
const correr = async () => {
  const { rows } = await db.query<{ id: string; restaurant_id: string; proveedor: string; credenciales_cifradas: Buffer }>(`select * from integraciones.conexiones where id = $1`, [conexionId]);
  return ejecutarConexion(pool, rows[0]);
};

describe.skipIf(!DIR)('sincronización de punta a punta', () => {
  beforeAll(async () => {
    const mig = (f: string) => readFileSync(join(DIR!, f), 'utf8');
    db = new PGlite();
    await db.exec(`
      create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema auth; create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      grant usage on schema auth to anon, authenticated, service_role, public;
      grant usage on schema public to anon, authenticated, service_role;
      create table restaurants(id uuid primary key, name text, daily_stock_reset_enabled boolean not null default false);
      create table menu_items(id uuid primary key default gen_random_uuid(), restaurant_id uuid references restaurants(id), name text not null,
        description text, price integer not null default 1, category text not null default 'General', image_url text, item_type text default 'permanent',
        is_available boolean default true, is_available_for_takeaway boolean default true, takeaway_price integer, is_menu_del_dia boolean default false,
        stock_managed boolean default false, current_stock integer default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
      alter table menu_items enable row level security;
      create table takeaway_orders(id uuid primary key default gen_random_uuid(), user_id uuid, restaurant_id uuid, items jsonb, total_amount integer, status text,
        approved_at timestamptz, metadata jsonb, updated_at timestamptz);
      alter table takeaway_orders enable row level security;
      create function auto_approve_takeaway_order() returns trigger language plpgsql as $$ begin return NEW; end $$;
      create trigger tr_auto_approve_takeaway_order before insert on takeaway_orders for each row execute function auto_approve_takeaway_order();
      insert into restaurants(id, name) values ('${R1}', 'Cri-Olla');
    `);
    await db.exec(mig('007_takeaway_inventory_trigger_reference.sql'));
    await db.exec(mig('008_inventory_module.sql'));
    await db.exec(`
      alter table inventory_movements drop constraint inventory_movements_reason_check;
      alter table inventory_movements add constraint inventory_movements_reason_check check (reason = any (array['ORDER_APPROVED','ORDER_RETURNED','MANUAL_INCREASE','MANUAL_DECREASE','DAILY_INITIAL','DAILY_CLOSE_ZERO']));
      create table inventory_daily_close(day date primary key, ran_at timestamptz not null default now(), items_reset integer not null default 0);
    `);
    await db.exec(mig('046_menu_categories.sql'));
    await db.exec(mig('060_integracion_menu.sql'));
    await db.exec(readFileSync(join(__dirname, '..', '001_esquema_integraciones.sql'), 'utf8'));
    const cifrado = encryptSecret(JSON.stringify({ apiKey: 'k', apiSecret: 's' }), clave, credentialAad(R1, 'fudo'));
    const r = await db.query<{ id: string }>(`insert into integraciones.conexiones(restaurant_id, proveedor, credenciales_cifradas) values ($1,'fudo',$2) returning id`, [R1, cifrado]);
    conexionId = r.rows[0].id;
    await db.exec('set role integraciones_service'); // todo lo que sigue corre con los permisos reales del servicio

    process.env.CREDENTIALS_KEY = clave.toString('base64');
    vi.stubGlobal('fetch', async (u: string) => {
      const body = String(u).includes('auth') ? { token: 't' } : respuestaFudo;
      return new Response(JSON.stringify(body), { status: 200 });
    });
  });
  afterAll(() => { vi.unstubAllGlobals(); });

  it('primera carga: platos, categoría y stock llegan a almuerzo.cl', async () => {
    respuestaFudo = { data: [prod(1, 'Cazuela', { stockControl: true, stock: 10 }), prod(2, 'Bebida')], included: categorias };
    const r = await correr();
    expect(r.estado).toBe('ok');
    const e = await estado();
    expect(e.map((x) => [x.external_id, x.name, x.is_available, x.current_stock])).toEqual([['1', 'Cazuela', true, 10], ['2', 'Bebida', true, 0]]);
    expect(e[0].stock_managed).toBe(true);
    const c = await db.query<{ ultimo_sync_ok_at: Date | null; errores_consecutivos: number }>(`select ultimo_sync_ok_at, errores_consecutivos from integraciones.conexiones`);
    expect(c.rows[0].ultimo_sync_ok_at).not.toBeNull();
    expect((await db.query(`select resultado, creados from integraciones.ejecuciones order by inicio desc limit 1`)).rows[0]).toEqual({ resultado: 'ok', creados: 2 });
  });
  it('una venta en almuerzo.cl no se pisa: el externo baja 2 y se aplica solo esa diferencia', async () => {
    await db.exec('reset role');
    await db.exec(`select inventory_move((select id from menu_items where external_id='1'), -3, 'ORDER_APPROVED', gen_random_uuid(), null)`);
    await db.exec('set role integraciones_service');
    respuestaFudo = { data: [prod(1, 'Cazuela', { stockControl: true, stock: 8 }), prod(2, 'Bebida')], included: categorias };
    await correr();
    expect((await estado())[0].current_stock).toBe(5); // 10 − 3 (almuerzo) − 2 (FUDO)
  });
  it('cambios de nombre y precio del externo se reflejan', async () => {
    respuestaFudo = { data: [prod(1, 'Cazuela de pollo', { stockControl: true, stock: 8, price: 6500 }), prod(2, 'Bebida')], included: categorias };
    await correr();
    expect((await estado())[0].name).toBe('Cazuela de pollo');
  });
  it('un producto que sale de la carta se oculta y al volver se reactiva', async () => {
    respuestaFudo = { data: [prod(1, 'Cazuela de pollo', { stockControl: true, stock: 8 })], included: categorias };
    await correr();
    expect((await estado())[1]).toMatchObject({ external_id: '2', hidden_by_integration: true, is_available: false });
    respuestaFudo = { data: [prod(1, 'Cazuela de pollo', { stockControl: true, stock: 8 }), prod(2, 'Bebida')], included: categorias };
    await correr();
    expect((await estado())[1]).toMatchObject({ hidden_by_integration: false, is_available: true });
  });
  it('FUDO en 0: el plato se apaga solo', async () => {
    respuestaFudo = { data: [prod(1, 'Cazuela de pollo', { stockControl: true, stock: 0 }), prod(2, 'Bebida')], included: categorias };
    await correr();
    expect((await estado())[0]).toMatchObject({ current_stock: 0, is_available: false });
  });
  it('un fallo de FUDO queda registrado y cuenta como error de la conexión', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 500 }));
    const r = await correr();
    expect(r.estado).toBe('error');
    const c = await db.query<{ errores_consecutivos: number; ultimo_error: string }>(`select errores_consecutivos, ultimo_error from integraciones.conexiones`);
    expect(c.rows[0].errores_consecutivos).toBe(1);
    expect(c.rows[0].ultimo_error).toMatch(/FUDO/);
  });
  it('el servicio, con su rol, no puede tocar tablas de almuerzo.cl directamente', async () => {
    await expect(db.query(`update menu_items set price = 1`)).rejects.toThrow();
    await expect(db.query(`select * from restaurants`)).rejects.toThrow();
  });
});
