# Puesta en marcha de integraciones.almuerzo.cl

Guía para quien tiene acceso a Google Cloud y a Supabase. **Nunca** pegue contraseñas ni claves en un chat, un commit o un ticket.
Las migraciones ya están aplicadas (060 de `v5-pwa` y 001 de este repositorio, 2026-11-07). Falta todo lo que sigue.

Variables que se usan en los comandos (ajuste los valores):

```bash
export PROJECT_ID="<su-proyecto-de-gcp>"
export REGION="us-central1"
export SUPABASE_REF="kqanordhsmbtcwtjtrme"
export SUPABASE_URL="https://kqanordhsmbtcwtjtrme.supabase.co"
export SUPABASE_ANON_KEY="<anon key pública del proyecto>"
gcloud config set project "$PROJECT_ID"
```

## 0. Servicios de Google Cloud

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com cloudscheduler.googleapis.com
```

## 1. Contraseña del rol `integraciones_service`

El rol ya existe sin acceso (`NOLOGIN`). Genere una contraseña **sin imprimirla** y guárdela en una variable de la sesión:

```bash
export DB_PASS="$(openssl rand -hex 24)"
```

Ábrale el acceso con la conexión de administrador (la de `postgres`, desde Supabase → Connect). Un máximo de 10 conexiones simultáneas:

```bash
psql "$ADMIN_DATABASE_URL" -c "ALTER ROLE integraciones_service LOGIN PASSWORD '$DB_PASS' CONNECTION LIMIT 10"
```

## 2. Secretos en Secret Manager

URL de conexión del servicio: en Supabase → Connect → **Transaction pooler** copie host y puerto (6543). El usuario es `integraciones_service.<SUPABASE_REF>`:

```bash
export POOLER_HOST="<host del transaction pooler, p. ej. aws-0-us-east-2.pooler.supabase.com>"
printf 'postgresql://integraciones_service.%s:%s@%s:6543/postgres' "$SUPABASE_REF" "$DB_PASS" "$POOLER_HOST" | gcloud secrets create integraciones-database-url --data-file=-
```

Clave con la que se cifran las credenciales de FUDO (guárdela también en un lugar seguro: sin ella no se pueden descifrar):

```bash
openssl rand -base64 32 | gcloud secrets create integraciones-credentials-key --data-file=-
```

Certificado de la base. Descárguelo de Supabase → Database → Settings → SSL (archivo `.crt`) y súbalo:

```bash
gcloud secrets create integraciones-database-ca --data-file=./prod-ca-2021.crt
```

`cron-secret` ya existe (lo usa el dashboard); se reutiliza. Compruebe:

```bash
gcloud secrets list --filter="name~integraciones OR name~cron-secret"
```

Permiso de lectura para la cuenta con la que corre Cloud Run (por defecto, la de Compute):

```bash
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
for S in integraciones-database-url integraciones-credentials-key integraciones-database-ca cron-secret; do
  gcloud secrets add-iam-policy-binding "$S" --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" --role=roles/secretmanager.secretAccessor
done
```

## 3. Probar la conexión a la base ANTES de desplegar

```bash
psql "$(gcloud secrets versions access latest --secret=integraciones-database-url)?sslmode=verify-full&sslrootcert=./prod-ca-2021.crt" -c "select count(*) from integraciones.conexiones"
```

Debe responder `0`. Compruebe también que el rol **no** ve las tablas de almuerzo.cl (debe dar «permission denied»):

```bash
psql "$(gcloud secrets versions access latest --secret=integraciones-database-url)?sslmode=verify-full&sslrootcert=./prod-ca-2021.crt" -c "select count(*) from public.menu_items"
```

## 4. Artifact Registry y despliegue

El repositorio de imágenes `almuerzo` lo usa el dashboard; si no existe:

```bash
gcloud artifacts repositories describe almuerzo --location "$REGION" || gcloud artifacts repositories create almuerzo --repository-format=docker --location "$REGION"
```

Despliegue (desde la rama que quiera publicar; antes de mezclar la solicitud #1, use `feat/pantalla-principal`). El `Dockerfile` corre pruebas, tipos y build: si algo falla, no se despliega.

```bash
git clone https://github.com/almuerzocl/integraciones && cd integraciones && git checkout feat/pantalla-principal
```

```bash
gcloud builds submit --config cloudbuild.yaml --substitutions "_NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL},_NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}" .
```

## 5. Verificar el servicio (sin FUDO)

```bash
SERVICE_URL=$(gcloud run services describe almuerzo-integraciones --region "$REGION" --format='value(status.url)'); echo "$SERVICE_URL"
```

```bash
curl -s "$SERVICE_URL/api/health"
```

Debe responder `{"ok":true}`. La ruta de sincronización debe rechazar a quien no trae el secreto (401):

```bash
curl -s -o /dev/null -w "%{http_code}\n" "$SERVICE_URL/api/cron/sync"
```

Abra `$SERVICE_URL/login` en el navegador e ingrese con una cuenta **administradora de un restaurante** (rol `RESTAURANT_ADMIN`, `OWNER` o `ADMIN` con restaurante asignado). Debe ver el resumen con FUDO «Sin conectar». Si falla, vea los registros:

```bash
gcloud run services logs read almuerzo-integraciones --region "$REGION" --limit 50
```

## 6. Dominio `integraciones.almuerzo.cl`

```bash
gcloud beta run domain-mappings create --service almuerzo-integraciones --domain integraciones.almuerzo.cl --region "$REGION"
```

Cree en el DNS de `almuerzo.cl` el registro que indique el comando (normalmente `CNAME integraciones → ghs.googlehosted.com.`) y espere el certificado:

```bash
gcloud beta run domain-mappings describe --domain integraciones.almuerzo.cl --region "$REGION"
```

## 7. Tarea programada (queda PAUSADA)

```bash
./setup_scheduler_sync.sh
```

**No la active** hasta haber conectado FUDO y comprobado a mano que «Sincronizar ahora» funciona en un restaurante de prueba:

```bash
gcloud scheduler jobs resume integraciones-sync --location "$REGION"
```

## 8. Primera conexión con FUDO (cuando haya claves)

1. En FUDO: *Aplicaciones externas → API Pública General* (plan Pro), cree un usuario solo para la API con lectura de productos y categorías, copie API Key y API Secret.
2. Ingrese esas credenciales en `integraciones.almuerzo.cl` → pestaña FUDO → «Probar y guardar».
3. «Sincronizar ahora» y revise el Gestor de menú del restaurante.
4. **Primero en el restaurante de demostración**, después en Cri-olla.
5. Si la autenticación falla con un error de formato, ajuste `src/lib/fudo/cliente.ts` (el formato de `POST` a `auth.fu.do` no está verificado).

## 9. Volver atrás

Pausar la sincronización:

```bash
gcloud scheduler jobs pause integraciones-sync --location "$REGION"
```

Quitar el acceso del rol a la base (los platos ya cargados quedan como están):

```bash
psql "$ADMIN_DATABASE_URL" -c "ALTER ROLE integraciones_service NOLOGIN"
```

Quitar el servicio:

```bash
gcloud run services delete almuerzo-integraciones --region "$REGION"
```
