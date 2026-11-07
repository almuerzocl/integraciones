import { Pool } from 'pg';
import { env } from './env';

// Conexión directa a Postgres con el rol integraciones_service: solo ve su esquema y ejecuta funciones integracion_*.
// Un pool por proceso; Cloud Run reutiliza instancias.
let pool: Pool | undefined;

export function db(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: env.databaseUrl, max: 5, idleTimeoutMillis: 30_000, statement_timeout: 30_000 });
  }
  return pool;
}
