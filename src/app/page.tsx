import { obtenerConexion, ultimasEjecuciones } from '@/lib/conexiones';
import { requerirAdmin } from '@/lib/contexto';
import { db } from '@/lib/db';
import { Panel } from './panel';

export const dynamic = 'force-dynamic';

export default async function Inicio() {
  const ctx = await requerirAdmin();
  const conexion = await obtenerConexion(db(), ctx.restaurantId, 'fudo');
  const ejecuciones = conexion ? await ultimasEjecuciones(db(), conexion.id) : [];
  return <Panel email={ctx.email} conexion={conexion} ejecuciones={ejecuciones} />;
}
