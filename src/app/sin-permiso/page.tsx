import { salir } from '../login/actions';

export default function SinPermiso() {
  return (
    <>
      <h1>Sin permiso</h1>
      <p className="sub">Su cuenta no administra un restaurante. Las integraciones las configura el administrador del restaurante.</p>
      <form action={salir}><button className="ghost" type="submit">Salir</button></form>
    </>
  );
}
