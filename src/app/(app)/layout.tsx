import { Marco } from '@/components/marco';
import { estadoDe, INTEGRACIONES, type EstadoIntegracion } from '@/lib/catalogo';
import { listarConexiones } from '@/lib/conexiones';
import { requerirAdmin } from '@/lib/contexto';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Todo lo que está dentro de (app) exige sesión y rol de administrador (requerirAdmin).
export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const ctx = await requerirAdmin();
  const conexiones = await listarConexiones(db(), ctx.restaurantId);
  const estados: Record<string, EstadoIntegracion> = {};
  for (const i of INTEGRACIONES) estados[i.id] = estadoDe(conexiones.get(i.proveedor));
  return <Marco email={ctx.email} estados={estados}>{children}</Marco>;
}
