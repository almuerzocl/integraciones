'use server';
import { revalidatePath } from 'next/cache';
import { credentialAad, encryptSecret, parseKey } from '@/lib/crypto';
import { cambiarEstado, eliminarConexion, guardarConexion, obtenerConexion, ultimoInicio } from '@/lib/conexiones';
import { requerirAdmin } from '@/lib/contexto';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { FudoCliente, FudoError } from '@/lib/fudo/cliente';
import { ejecutarConexion } from '@/lib/sync/ejecutar';
import { segundosParaSincronizar, validarCredenciales } from '@/lib/validacion';

const PROVEEDOR = 'fudo';
export type Estado = { ok?: string; error?: string } | undefined;

// Cada acción vuelve a validar sesión, rol y restaurante: una server action es invocable con cualquier cuerpo.
// El restaurante sale SIEMPRE del perfil del usuario, nunca del formulario.

export async function conectar(_prev: Estado, form: FormData): Promise<Estado> {
  const ctx = await requerirAdmin();
  const v = validarCredenciales(form.get('apiKey'), form.get('apiSecret'));
  if (!v.ok) return { error: v.error };

  // Se prueba ANTES de guardar: lo que no autentica no se almacena.
  let cantidad: number;
  try {
    cantidad = (await new FudoCliente(v.valor.apiKey, v.valor.apiSecret).listarProductosActivos()).length;
  } catch (e) {
    return { error: e instanceof FudoError ? `${e.message}.` : 'No se pudo probar la conexión con FUDO.' };
  }
  const cifradas = encryptSecret(JSON.stringify(v.valor), parseKey(env.credentialsKey), credentialAad(ctx.restaurantId, PROVEEDOR));
  await guardarConexion(db(), ctx.restaurantId, PROVEEDOR, cifradas, ctx.userId);
  revalidatePath('/');
  return { ok: `Conexión guardada. FUDO tiene ${cantidad} producto(s) vigentes. Use «Sincronizar ahora» para cargarlos.` };
}

export async function sincronizarAhora(): Promise<Estado> {
  const ctx = await requerirAdmin();
  const c = await obtenerConexion(db(), ctx.restaurantId, PROVEEDOR);
  if (!c) return { error: 'Aún no hay una conexión configurada.' };
  if (c.estado === 'pausada') return { error: 'La conexión está pausada. Reanúdela primero.' };
  const espera = segundosParaSincronizar(await ultimoInicio(db(), c.id));
  if (espera > 0) return { error: `Espere ${espera} s para volver a sincronizar.` };

  const { rows } = await db().query<{ id: string; restaurant_id: string; proveedor: string; credenciales_cifradas: Buffer }>(
    'select id, restaurant_id, proveedor, credenciales_cifradas from integraciones.conexiones where id = $1', [c.id]);
  const r = await ejecutarConexion(db(), rows[0]);
  revalidatePath('/');
  if (r.estado === 'ocupada') return { error: 'Ya hay una sincronización en curso.' };
  if (r.estado === 'error') return { error: `La sincronización terminó con errores: ${r.error}` };
  const x = r.resumen!;
  return { ok: `Listo: ${x.creados} nuevo(s), ${x.actualizados} revisado(s), ${x.ocultados} oculto(s), ${x.reactivados} reactivado(s), ${x.ajustesStock} ajuste(s) de stock.` };
}

export async function pausarOReanudar(_prev: Estado, form: FormData): Promise<Estado> {
  const ctx = await requerirAdmin();
  const destino = form.get('destino') === 'pausada' ? 'pausada' : 'activa';
  const hecho = await cambiarEstado(db(), ctx.restaurantId, PROVEEDOR, destino);
  revalidatePath('/');
  return hecho ? { ok: destino === 'pausada' ? 'Sincronización pausada.' : 'Sincronización reanudada.' } : { error: 'No hay una conexión configurada.' };
}

export async function desconectar(_prev: Estado, form: FormData): Promise<Estado> {
  const ctx = await requerirAdmin();
  if (form.get('confirmar') !== 'DESCONECTAR') return { error: 'Escriba DESCONECTAR para confirmar.' };
  const hecho = await eliminarConexion(db(), ctx.restaurantId, PROVEEDOR);
  revalidatePath('/');
  return hecho ? { ok: 'Conexión eliminada. Los platos ya cargados siguen en su menú, pero ya no se actualizan.' } : { error: 'No hay una conexión configurada.' };
}
