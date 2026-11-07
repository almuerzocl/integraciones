import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { ejecutarTodas } from '@/lib/sync/ejecutar';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function autorizado(request: Request): boolean {
  let secreto: string;
  try { secreto = env.cronSecret; } catch { return false; }
  const esperado = Buffer.from(`Bearer ${secreto}`);
  const recibido = Buffer.from(request.headers.get('authorization') ?? '');
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}

/**
 * GET /api/cron/sync  — lo invoca Cloud Scheduler cada pocos minutos con `Authorization: Bearer $CRON_SECRET`.
 * Responde solo conteos: nunca credenciales ni el detalle de errores de FUDO.
 */
export async function GET(request: Request) {
  if (!autorizado(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const resultados = await ejecutarTodas(db());
    const resumen = {
      conexiones: resultados.length,
      ok: resultados.filter((r) => r.estado === 'ok').length,
      conError: resultados.filter((r) => r.estado === 'error').length,
      ocupadas: resultados.filter((r) => r.estado === 'ocupada').length,
    };
    console.log('[CRON sync]', JSON.stringify(resumen));
    return NextResponse.json({ success: true, ...resumen });
  } catch (e) {
    console.error('[CRON sync] Error:', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
  }
}
