import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '../env';

// Cliente de Supabase con la sesión del usuario (cookies). Solo con la anon key: lo único que se lee con él es el
// propio perfil del usuario, protegido por las policies de la base. No existe aquí la service_role key.
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* render de servidor: lo refresca el middleware */ }
      },
    },
  });
}
