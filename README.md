# almuerzo-integraciones

Servicio aparte (`integraciones.almuerzo.cl`) que conecta almuerzo.cl con sistemas externos. Hoy: **FUDO → menú**.
almuerzo.cl conserva su diseño estándar; este servicio solo cambia el **método de ingreso** del menú.

## Cómo encaja

```
FUDO (API pública) ──lee──▶ integraciones (este servicio) ──funciones integracion_*──▶ base de almuerzo.cl
                                   │                                                          ▲
                              esquema propio `integraciones`                      dashboard del restaurante
                              (conexiones, historial, stock visto)                 (platos de FUDO en solo lectura)
```

- **Sin service_role key.** El servicio usa el rol Postgres `integraciones_service`: solo ejecuta `integracion_*` y ve su esquema.
- **Credenciales de FUDO cifradas** con AES-256-GCM (`CREDENTIALS_KEY`, en Secret Manager); la base nunca tiene la clave.
- **Ingreso** con la cuenta de almuerzo.cl; solo administradores del restaurante (`RESTAURANT_ADMIN`, `OWNER`, `ADMIN`) y solo para su restaurante.

## Estado

| Fase | Contenido | Estado |
| --- | --- | --- |
| A | Servicio, esquema propio, cifrado, login | hecha (esta rama) |
| B | Migración 060 en `v5-pwa` (rama `feat/integracion-menu`) | hecha, sin aplicar |
| C | Cliente FUDO y sincronización (`/api/cron/sync`, `setup_scheduler_sync.sh`) | hecha en esta rama, probada con datos simulados y contra la migración 060 |
| D | Pantalla de conexión y estado (conectar, probar, sincronizar ahora, pausar, eliminar) | hecha en esta rama |
| E | Pruebas en restaurante de demostración y puesta en marcha | pendiente |

## Orden de puesta en marcha (nada de esto está hecho)

1. Aplicar `v5-pwa/migrations/060_integracion_menu.sql` en una **branch de Supabase**, probar, y recién después en producción (con confirmación explícita).
2. Aplicar `migrations/001_esquema_integraciones.sql` de este repositorio.
3. Asignar login al rol fuera de cualquier archivo: `ALTER ROLE integraciones_service LOGIN PASSWORD '…'` y guardar la URL de conexión en el secreto `integraciones-database-url`.
4. Crear los secretos `integraciones-credentials-key` (`openssl rand -base64 32`) y reutilizar `cron-secret`.
5. Desplegar con `gcloud builds submit --config cloudbuild.yaml --substitutions _NEXT_PUBLIC_SUPABASE_URL=…,_NEXT_PUBLIC_SUPABASE_ANON_KEY=…`.
6. Mapear el dominio `integraciones.almuerzo.cl` al servicio de Cloud Run.

## Pendiente de verificar con credenciales reales de FUDO

- URL y cuerpo del endpoint de autenticación y el campo del token (`src/lib/fudo/cliente.ts`, variables opcionales `FUDO_AUTH_URL` y `FUDO_API_URL`).
- Que `filter[active]=eq.true` y `include=productCategory` se comporten como dice la especificación publicada.
- Que el stock de FUDO se descuente al vender en el local (la sincronización asume que sí).
- Límite conocido: si se pierde la tabla `stock_visto` de un plato que ya tenía stock en almuerzo.cl, la siguiente corrida suma el stock de FUDO sobre el existente. Se evita no borrando esa tabla a mano.

## Desarrollo

```bash
npm install
npm test            # pruebas (incluye el esquema sobre PGlite)
PWA_MIGRATIONS_DIR=../v5-pwa/migrations npm test   # además, la prueba de punta a punta contra la migración 060
npm run typecheck
npm run dev
```

Variables en `.env.example`. Las pruebas de migración no cubren concurrencia ni los permisos automáticos de Supabase:
verificarlos en la base real tras aplicar.
