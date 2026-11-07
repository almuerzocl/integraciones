'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { EstadoIntegracion } from '@/lib/catalogo';

export interface Pestana { id: string; nombre: string; estado?: EstadoIntegracion }

// Una pestaña por integración, más «Resumen». Son enlaces reales (URL propia por pestaña): se puede compartir,
// recargar y volver atrás. El punto de color avisa de un error sin entrar a la pestaña.
export function Pestanas({ pestanas, activaForzada }: { pestanas: Pestana[]; activaForzada?: string }) {
  const ruta = usePathname();
  const activa = activaForzada ?? (ruta === '/' ? 'resumen' : ruta.split('/')[1]);
  const todas: Pestana[] = [{ id: 'resumen', nombre: 'Resumen' }, ...pestanas];
  return (
    <nav className="tabs" aria-label="Integraciones">
      {todas.map((p) => (
        <Link key={p.id} href={p.id === 'resumen' ? '/' : `/${p.id}`} aria-current={activa === p.id ? 'page' : undefined} className={activa === p.id ? 'tab on' : 'tab'}>
          {p.nombre}
          {p.estado === 'con_error' && <span className="punto" role="img" aria-label="con error" />}
        </Link>
      ))}
    </nav>
  );
}
