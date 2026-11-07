import { Resumen } from '@/components/resumen';
import { listarConexiones } from '@/lib/conexiones';
import { requerirAdmin } from '@/lib/contexto';
import { db } from '@/lib/db';

export default async function Inicio() {
  const ctx = await requerirAdmin();
  return <Resumen conexiones={await listarConexiones(db(), ctx.restaurantId)} />;
}
