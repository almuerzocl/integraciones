// Variables de entorno del servicio. Se leen perezosamente para que `next build` no falle sin secretos.

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}`);
  return v;
}

export const env = {
  get supabaseUrl() { return required('NEXT_PUBLIC_SUPABASE_URL'); },
  get supabaseAnonKey() { return required('NEXT_PUBLIC_SUPABASE_ANON_KEY'); },
  get databaseUrl() { return required('DATABASE_URL'); },
  get credentialsKey() { return required('CREDENTIALS_KEY'); },
  get cronSecret() {
    const v = required('CRON_SECRET');
    if (v.length < 16) throw new Error('CRON_SECRET debe tener al menos 16 caracteres');
    return v;
  },
};
