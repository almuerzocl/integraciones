'use client';
import { useActionState } from 'react';
import { ingresar } from './actions';

export default function Login() {
  const [estado, accion, pendiente] = useActionState(ingresar, undefined);
  return (
    <>
      <h1>Integraciones</h1>
      <p className="sub">Ingrese con su cuenta de almuerzo.cl para conectar el menú de su restaurante.</p>
      <form action={accion} className="card">
        <label htmlFor="email">Correo</label>
        <input id="email" name="email" type="email" autoComplete="username" required />
        <label htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        <button type="submit" disabled={pendiente}>{pendiente ? 'Ingresando…' : 'Ingresar'}</button>
        {estado?.error && <p className="err" role="alert">{estado.error}</p>}
      </form>
    </>
  );
}
