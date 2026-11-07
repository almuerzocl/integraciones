import { BotonSincronizar, Desconectar, FormularioConectar, PausarReanudar } from '@/app/conexion/formularios';
import { Estado, fechaCorta } from '@/components/estado';
import { estadoDe } from '@/lib/catalogo';
import { obtenerConexion, ultimasEjecuciones, type ConexionVista, type EjecucionVista } from '@/lib/conexiones';
import { requerirAdmin } from '@/lib/contexto';
import { db } from '@/lib/db';

export async function PanelFudo() {
  const ctx = await requerirAdmin();
  const conexion = await obtenerConexion(db(), ctx.restaurantId, 'fudo');
  const ejecuciones = conexion ? await ultimasEjecuciones(db(), conexion.id) : [];
  return <VistaFudo conexion={conexion} ejecuciones={ejecuciones} />;
}

// Presentación pura (se puede previsualizar con datos de ejemplo).
export function VistaFudo({ conexion, ejecuciones }: { conexion: ConexionVista | null; ejecuciones: EjecucionVista[] }) {
  return (
    <>
      <section className="card">
        <h2>FUDO · menú</h2>
        {conexion ? (
          <>
            <p style={{ margin: '4px 0' }}>
              Estado: <Estado estado={estadoDe(conexion)} /> · última sincronización correcta: {fechaCorta(conexion.ultimo_sync_ok_at)}
            </p>
            {conexion.ultimo_error && <p className="err">Último error: {conexion.ultimo_error}</p>}
            <p className="sub">Cada 3 minutos se copian a su menú los productos vigentes de FUDO. El nombre, la descripción, el precio y la categoría se cambian en FUDO; la foto, el precio para llevar, las opciones y el menú del día, en almuerzo.cl.</p>
            <BotonSincronizar deshabilitado={conexion.estado === 'pausada'} />
          </>
        ) : (
          <p className="sub">Aún no hay conexión. Ingrese las credenciales de la API de FUDO para comenzar.</p>
        )}
      </section>

      {ejecuciones.length > 0 && (
        <section className="card">
          <h2>Últimas sincronizaciones</h2>
          <table>
            <thead><tr><th>Fecha</th><th>Resultado</th><th>Nuevos</th><th>Ocultos</th><th>Stock</th></tr></thead>
            <tbody>
              {ejecuciones.map((e) => (
                <tr key={e.inicio.toISOString()} title={e.error ?? undefined}>
                  <td>{fechaCorta(e.inicio)}</td>
                  <td className={e.resultado === 'error' ? 'err' : e.resultado === 'ok' ? 'ok' : ''}>{e.resultado === 'ok' ? 'Correcta' : e.resultado === 'error' ? 'Con error' : 'En curso'}</td>
                  <td>{e.creados}</td><td>{e.ocultados}</td><td>{e.ajustes_stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card">
        <h2>{conexion ? 'Credenciales' : 'Conectar FUDO'}</h2>
        <FormularioConectar yaConectado={!!conexion} />
      </section>

      {conexion && (
        <section className="card">
          <h2>Administrar</h2>
          <PausarReanudar pausada={conexion.estado === 'pausada'} />
          <details style={{ marginTop: 16 }}>
            <summary>Eliminar la conexión</summary>
            <Desconectar />
          </details>
        </section>
      )}
    </>
  );
}
