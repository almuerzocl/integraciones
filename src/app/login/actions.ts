'use server';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';

export async function ingresar(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  if (!email || !password) return { error: 'Ingrese su correo y contraseña.' };
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  // Mensaje único: no revela si el correo existe.
  if (error) return { error: 'Correo o contraseña incorrectos.' };
  redirect('/');
}

export async function salir() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect('/login');
}
