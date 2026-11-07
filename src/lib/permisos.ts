// Quién puede administrar integraciones: el administrador del restaurante, para SU restaurante.
// Se evalúa en el servidor con el perfil leído de la base; nunca se confía en un rol enviado por el navegador.

const ROLES_ADMIN = new Set(['RESTAURANT_ADMIN', 'OWNER', 'ADMIN']);

export interface PerfilMinimo {
  role?: string | null;
  restaurant_id?: string | null;
}

export function puedeAdministrarIntegraciones(perfil: PerfilMinimo | null | undefined): boolean {
  if (!perfil?.restaurant_id) return false;
  const rol = String(perfil.role ?? '').trim().toUpperCase();
  return ROLES_ADMIN.has(rol);
}
