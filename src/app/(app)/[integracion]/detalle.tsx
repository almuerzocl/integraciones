import type { Integracion } from '@/lib/catalogo';
import { PanelFudo } from './panel-fudo';

// Registro de paneles de detalle: una entrada por integración del catálogo (src/lib/catalogo.ts).
export async function Detalle({ integracion }: { integracion: Integracion }) {
  switch (integracion.id) {
    case 'fudo':
      return <PanelFudo />;
    default:
      return <p className="sub">Esta integración aún no tiene pantalla de configuración.</p>;
  }
}
