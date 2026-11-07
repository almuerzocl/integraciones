import Link from 'next/link';
import { estadoDe, INTEGRACIONES, type EstadoIntegracion } from '@/lib/catalogo';
import type { ConexionVista } from '@/lib/conexiones';
import { Estado, fechaCorta } from './estado';

// Pantalla principal: una tarjeta por integración con su estado. Lo que necesita atención va primero y destacado.
export function Resumen({ conexiones }: { conexiones: Map<string, ConexionVista> }) {
  const filas = INTEGRACIONES.map((i) => ({ i, c: conexiones.get(i.proveedor) ?? null }))
    .map((f) => ({ ...f, estado: estadoDe(f.c) as EstadoIntegracion }));
  const conError = filas.filter((f) => f.estado === 'con_error');
  const activas = filas.filter((f) => f.estado === 'activa').length;

  return (
    <>
      {conError.length > 0 ? (
        <div className="aviso aviso-error" role="alert">
          {conError.length === 1 ? `${conError[0].i.nombre} tiene un error y no se está sincronizando.` : `${conError.length} integraciones tienen errores.`}
          {' '}Revise el detalle en su pestaña.
        </div>
      ) : (
        <p className="sub">{activas} de {filas.length} integración(es) activas.</p>
      )}

      <div className="grid">
        {filas.map(({ i, c, estado }) => (
          <Link key={i.id} href={`/${i.id}`} className={`tarjeta tarjeta-${estado}`}>
            <div className="tarjeta-top"><strong>{i.nombre}</strong><Estado estado={estado} /></div>
            <p className="alcance">{i.alcance}</p>
            {estado === 'sin_conexion' ? (
              <p className="sub" style={{ margin: 0 }}>Aún no está conectada. Toque para configurarla.</p>
            ) : (
              <>
                <p className="dato">Última sincronización correcta<br /><strong>{fechaCorta(c?.ultimo_sync_ok_at ?? null)}</strong></p>
                {c?.ultimo_error && <p className="err dato">{c.ultimo_error}</p>}
              </>
            )}
          </Link>
        ))}
      </div>
      <p className="sub" style={{ marginTop: 16 }}>Las próximas integraciones aparecerán aquí, cada una con su pestaña.</p>
    </>
  );
}
