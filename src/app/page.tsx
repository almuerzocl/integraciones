import { requerirAdmin } from '@/lib/contexto';
import { db } from '@/lib/db';
import { salir } from './login/actions';

export const dynamic = 'force-dynamic';

export default async function Inicio() {
  const ctx = await requerirAdmin();
  const { rows } = await db().query<{ proveedor: string; estado: string; ultimo_sync_ok_at: Date | null; ultimo_error: string | null }>(
    `select proveedor, estado, ultimo_sync_ok_at, ultimo_error from integraciones.conexiones where restaurant_id = $1 order by proveedor`,
    [ctx.restaurantId],
  );
  return (
    <>
      <header className="top">
        <div><h1>Integraciones</h1><p className="sub" style={{ margin: 0 }}>{ctx.email}</p></div>
        <form action={salir}><button className="ghost" type="submit">Salir</button></form>
      </header>
      <section className="card">
        <h2>Conexiones</h2>
        {rows.length === 0
          ? <p className="sub" style={{ margin: 0 }}>Aún no hay ninguna conexión configurada.</p>
          : rows.map((c) => (
              <p key={c.proveedor} style={{ margin: '4px 0' }}>
                <strong>{c.proveedor}</strong> · {c.estado}
                {c.ultimo_sync_ok_at ? ` · última sincronización ${c.ultimo_sync_ok_at.toISOString()}` : ''}
                {c.ultimo_error ? <span className="err"> · {c.ultimo_error}</span> : null}
              </p>
            ))}
      </section>
    </>
  );
}
