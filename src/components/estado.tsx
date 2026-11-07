import { ETIQUETA_ESTADO, type EstadoIntegracion } from '@/lib/catalogo';

// El estado se comunica con texto Y color (no solo color).
export function Estado({ estado }: { estado: EstadoIntegracion }) {
  return <span className={`badge badge-${estado}`}>{ETIQUETA_ESTADO[estado]}</span>;
}

export const fechaCorta = (d: Date | null) =>
  d ? new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Santiago' }).format(d) : '—';
