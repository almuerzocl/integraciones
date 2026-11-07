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
| C | Cliente FUDO y sincronización | pendiente |
| D | Pantalla de conexión y estado | pendiente |
| E | Pruebas en restaurante de demostración y puesta en marcha | pendiente |

## Orden de puesta en marcha (nada de esto está hecho)

1. Aplicar `v5-pwa/migrations/060_integracion_menu.sql` en una **branch de Supabase**, probar, y recién después en producción (con confirmación explícita).
2. Aplicar `migrations/001_esquema_integraciones.sql` de este repositorio.
3. Asignar login al rol fuera de cualquier archivo: `ALTER ROLE integraciones_service LOGIN PASSWORD '…'` y guardar la URL de conexión en el secreto `integraciones-database-url`.
4. Crear los secretos `integraciones-credentials-key` (`openssl rand -base64 32`) y reutilizar `cron-secret`.
5. Desplegar con `gcloud builds submit --config cloudbuild.yaml --substitutions _NEXT_PUBLIC_SUPABASE_URL=…,_NEXT_PUBLIC_SUPABASE_ANON_KEY=…`.
6. Mapear el dominio `integraciones.almuerzo.cl` al servicio de Cloud Run.

## Desarrollo

```bash
npm install
npm test            # pruebas (incluye el esquema sobre PGlite)
npm run typecheck
npm run dev
```

Variables en `.env.example`. Las pruebas de migración no cubren concurrencia ni los permisos automáticos de Supabase:
verificarlos en la base real tras aplicar.
