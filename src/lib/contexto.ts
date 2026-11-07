import { cache } from 'react';
import { redirect } from 'next/navigation';
import { supabaseServer } from './supabase/server';
import { puedeAdministrarIntegraciones } from './permisos';

export interface ContextoAdmin {
  userId: string;
  email: string;
  restaurantId: string;
  rol: string;
}

// Usuario autenticado (validado contra Supabase Auth, no solo leyendo la cookie) con permiso para administrar
// integraciones. Sin sesión va a /login; con sesión pero sin permiso va a /sin-permiso.
export const requerirAdmin = cache(async (): Promise<ContextoAdmin> => {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfil } = await supabase.from('profiles').select('role, restaurant_id').eq('id', user.id).maybeSingle();
  if (!puedeAdministrarIntegraciones(perfil)) redirect('/sin-permiso');

  return { userId: user.id, email: user.email ?? '', restaurantId: perfil!.restaurant_id as string, rol: String(perfil!.role) };
});
