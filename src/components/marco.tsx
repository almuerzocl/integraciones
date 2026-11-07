import { salir } from '@/app/login/actions';
import { INTEGRACIONES, type EstadoIntegracion } from '@/lib/catalogo';
import { Pestanas } from './pestanas';

// Marco común de todas las pantallas autenticadas: cabecera, pestañas y contenido.
export function Marco({ email, estados, activaForzada, children }: {
  email: string;
  estados: Record<string, EstadoIntegracion>;
  activaForzada?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="top">
        <div><h1>Integraciones</h1><p className="sub" style={{ margin: 0 }}>{email}</p></div>
        <form action={salir}><button className="ghost" type="submit">Salir</button></form>
      </header>
      <Pestanas activaForzada={activaForzada} pestanas={INTEGRACIONES.map((i) => ({ id: i.id, nombre: i.nombre, estado: estados[i.id] }))} />
      {children}
    </>
  );
}
