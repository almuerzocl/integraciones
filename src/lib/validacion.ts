// Validación de lo que escribe el administrador. Solo texto plano acotado; nada se interpreta ni se muestra de vuelta.

export interface CredencialesFudo { apiKey: string; apiSecret: string }

export function validarCredenciales(apiKey: unknown, apiSecret: unknown): { ok: true; valor: CredencialesFudo } | { ok: false; error: string } {
  const k = typeof apiKey === 'string' ? apiKey.trim() : '';
  const s = typeof apiSecret === 'string' ? apiSecret.trim() : '';
  if (!k || !s) return { ok: false, error: 'Ingrese la API Key y el API Secret de FUDO.' };
  if (k.length > 200 || s.length > 500) return { ok: false, error: 'La API Key o el API Secret son demasiado largos.' };
  if (/\s/.test(k) || /\s/.test(s)) return { ok: false, error: 'La API Key y el API Secret no deben tener espacios.' };
  return { ok: true, valor: { apiKey: k, apiSecret: s } };
}

export const ESPERA_MINIMA_SYNC_MS = 60_000;

/** Devuelve los segundos que faltan para poder sincronizar a mano de nuevo, o 0 si ya se puede. */
export function segundosParaSincronizar(ultimoInicio: Date | null, ahora: Date = new Date()): number {
  if (!ultimoInicio) return 0;
  const falta = ESPERA_MINIMA_SYNC_MS - (ahora.getTime() - ultimoInicio.getTime());
  return falta > 0 ? Math.ceil(falta / 1000) : 0;
}
