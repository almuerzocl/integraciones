// Catálogo de integraciones. Para sumar una nueva:
//   1. agregarla aquí;
//   2. crear su panel de detalle y registrarlo en src/app/(app)/[integracion]/detalle.tsx;
//   3. (si guarda conexión propia) usar su `proveedor` en integraciones.conexiones.
// La pantalla principal y las pestañas se arman solas a partir de esta lista.

export interface Integracion {
  /** Segmento de la URL y de la pestaña: /fudo */
  id: string;
  /** Nombre corto para la pestaña y la tarjeta. */
  nombre: string;
  /** Qué sincroniza. */
  alcance: string;
  descripcion: string;
  /** Valor de integraciones.conexiones.proveedor. */
  proveedor: string;
}

export const INTEGRACIONES: readonly Integracion[] = [
  {
    id: 'fudo',
    nombre: 'FUDO',
    alcance: 'Menú y stock',
    descripcion: 'Copia a almuerzo.cl los productos vigentes de FUDO, con su categoría, precio y stock.',
    proveedor: 'fudo',
  },
];

export const buscarIntegracion = (id: string): Integracion | undefined => INTEGRACIONES.find((i) => i.id === id);

export type EstadoIntegracion = 'sin_conexion' | 'activa' | 'pausada' | 'con_error';

export const ETIQUETA_ESTADO: Record<EstadoIntegracion, string> = {
  sin_conexion: 'Sin conectar',
  activa: 'Activa',
  pausada: 'Pausada',
  con_error: 'Con error',
};

/** Resume el estado de una integración a partir de su conexión (o la falta de ella). */
export function estadoDe(conexion: { estado: 'activa' | 'pausada' | 'con_error' } | null | undefined): EstadoIntegracion {
  return conexion ? conexion.estado : 'sin_conexion';
}
