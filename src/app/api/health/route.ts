import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Solo indica que el servicio está arriba. No toca la base ni expone configuración.
export function GET() {
  return NextResponse.json({ ok: true });
}
