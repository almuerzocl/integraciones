'use client';
import { useActionState } from 'react';
import { conectar, desconectar, pausarOReanudar, sincronizarAhora, type Estado } from './actions';

const Mensaje = ({ e }: { e: Estado }) =>
  e?.error ? <p className="err" role="alert">{e.error}</p> : e?.ok ? <p className="ok" role="status">{e.ok}</p> : null;

export function FormularioConectar({ yaConectado }: { yaConectado: boolean }) {
  const [estado, accion, pendiente] = useActionState(conectar, undefined);
  return (
    <form action={accion}>
      <p className="sub">En FUDO: <em>Aplicaciones externas → API Pública General</em>. Cree un usuario solo para la API, con permiso de lectura de productos y categorías.</p>
      <label htmlFor="apiKey">API Key</label>
      <input id="apiKey" name="apiKey" autoComplete="off" spellCheck={false} required />
      <label htmlFor="apiSecret">API Secret</label>
      <input id="apiSecret" name="apiSecret" type="password" autoComplete="new-password" spellCheck={false} required />
      <button type="submit" disabled={pendiente}>{pendiente ? 'Probando conexión…' : yaConectado ? 'Cambiar credenciales' : 'Probar y guardar'}</button>
      <Mensaje e={estado} />
    </form>
  );
}

export function BotonSincronizar({ deshabilitado }: { deshabilitado: boolean }) {
  const [estado, accion, pendiente] = useActionState(sincronizarAhora, undefined);
  return (
    <form action={accion}>
      <button type="submit" disabled={pendiente || deshabilitado}>{pendiente ? 'Sincronizando…' : 'Sincronizar ahora'}</button>
      <Mensaje e={estado} />
    </form>
  );
}

export function PausarReanudar({ pausada }: { pausada: boolean }) {
  const [estado, accion, pendiente] = useActionState(pausarOReanudar, undefined);
  return (
    <form action={accion}>
      <input type="hidden" name="destino" value={pausada ? 'activa' : 'pausada'} />
      <button className="ghost" type="submit" disabled={pendiente}>{pausada ? 'Reanudar sincronización' : 'Pausar sincronización'}</button>
      <Mensaje e={estado} />
    </form>
  );
}

export function Desconectar() {
  const [estado, accion, pendiente] = useActionState(desconectar, undefined);
  return (
    <form action={accion}>
      <label htmlFor="confirmar">Para eliminar la conexión escriba DESCONECTAR</label>
      <input id="confirmar" name="confirmar" autoComplete="off" />
      <button className="ghost" type="submit" disabled={pendiente}>Eliminar conexión</button>
      <Mensaje e={estado} />
    </form>
  );
}
