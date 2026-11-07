import { notFound } from 'next/navigation';
import { buscarIntegracion } from '@/lib/catalogo';
import { Detalle } from './detalle';

export default async function PaginaIntegracion({ params }: { params: Promise<{ integracion: string }> }) {
  const { integracion } = await params;
  const def = buscarIntegracion(integracion);
  if (!def) notFound();
  return <Detalle integracion={def} />;
}
