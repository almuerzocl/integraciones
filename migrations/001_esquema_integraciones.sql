-- 001_esquema_integraciones.sql
-- Esquema PROPIO del servicio integraciones.almuerzo.cl, en la misma base de almuerzo.cl.
--
-- NO APLICADA. Requisitos previos, en este orden:
--   1. Migración 060 de v5-pwa (crea el rol integraciones_service y las funciones integracion_*).
--   2. Esta migración.
--   3. Fuera de cualquier archivo: ALTER ROLE integraciones_service LOGIN PASSWORD '...';  (la contraseña va en Secret Manager).
--
-- Qué guarda
--   conexiones    una por (restaurante, proveedor): credenciales CIFRADAS por la aplicación (AES-256-GCM; la clave NO está en la base)
--   ejecuciones   registro de cada sincronización, para ver estado y errores desde la interfaz
--   stock_visto   último stock leído del sistema externo por plato; sin esto no se pueden calcular las diferencias
--
-- Seguridad: RLS activo y una única policy por tabla, solo para el rol del servicio. Los roles de la API de Supabase
-- (anon, authenticated, service_role) no tienen ningún privilegio sobre este esquema.
-- Rollback al final.

BEGIN;

CREATE SCHEMA IF NOT EXISTS integraciones;
REVOKE ALL ON SCHEMA integraciones FROM PUBLIC;

CREATE TABLE integraciones.conexiones (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id        uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    proveedor            text NOT NULL CHECK (proveedor ~ '^[a-z0-9_]{2,30}$'),
    estado               text NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'pausada', 'con_error')),
    credenciales_cifradas bytea NOT NULL,
    creada_por           uuid,
    ultimo_sync_ok_at    timestamptz,
    ultimo_error         text,
    errores_consecutivos integer NOT NULL DEFAULT 0 CHECK (errores_consecutivos >= 0),
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT conexiones_restaurante_proveedor_key UNIQUE (restaurant_id, proveedor)
);

CREATE TABLE integraciones.ejecuciones (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conexion_id   uuid NOT NULL REFERENCES integraciones.conexiones(id) ON DELETE CASCADE,
    inicio        timestamptz NOT NULL DEFAULT now(),
    fin           timestamptz,
    resultado     text NOT NULL DEFAULT 'en_curso' CHECK (resultado IN ('en_curso', 'ok', 'error')),
    creados       integer NOT NULL DEFAULT 0,
    actualizados  integer NOT NULL DEFAULT 0,
    ocultados     integer NOT NULL DEFAULT 0,
    reactivados   integer NOT NULL DEFAULT 0,
    ajustes_stock integer NOT NULL DEFAULT 0,
    error         text
);
CREATE INDEX ejecuciones_conexion_inicio_idx ON integraciones.ejecuciones (conexion_id, inicio DESC);

CREATE TABLE integraciones.stock_visto (
    conexion_id uuid NOT NULL REFERENCES integraciones.conexiones(id) ON DELETE CASCADE,
    external_id text NOT NULL,
    stock       integer NOT NULL CHECK (stock >= 0),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (conexion_id, external_id)
);

ALTER TABLE integraciones.conexiones  ENABLE ROW LEVEL SECURITY;
ALTER TABLE integraciones.ejecuciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE integraciones.stock_visto ENABLE ROW LEVEL SECURITY;

-- RLS sin policies bloquearía también al servicio (su rol no salta RLS): una policy por tabla, solo para su rol.
CREATE POLICY servicio_total ON integraciones.conexiones  FOR ALL TO integraciones_service USING (true) WITH CHECK (true);
CREATE POLICY servicio_total ON integraciones.ejecuciones FOR ALL TO integraciones_service USING (true) WITH CHECK (true);
CREATE POLICY servicio_total ON integraciones.stock_visto FOR ALL TO integraciones_service USING (true) WITH CHECK (true);

-- Mínimo privilegio para el servicio; nadie más.
REVOKE ALL ON ALL TABLES IN SCHEMA integraciones FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA integraciones TO integraciones_service;
GRANT SELECT, INSERT, UPDATE, DELETE ON integraciones.conexiones, integraciones.ejecuciones, integraciones.stock_visto
    TO integraciones_service;

-- Las tablas nuevas de este esquema no heredan privilegios por defecto.
ALTER DEFAULT PRIVILEGES IN SCHEMA integraciones REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;

COMMIT;

-- ROLLBACK:
--   DROP SCHEMA integraciones CASCADE;   -- borra conexiones, historial y stock visto
