#!/bin/bash
# Declara el Cloud Scheduler job de la sincronización de menú (cada 3 minutos).
# Ejecutar UNA VEZ, después de desplegar el servicio y de aplicar las migraciones.
# El job se crea PAUSADO: se activa solo con orden expresa:  gcloud scheduler jobs resume integraciones-sync --location us-central1
# Requiere: gcloud autenticado con permisos cloudscheduler.jobs.create y acceso al secreto cron-secret.
set -euo pipefail

REGION="us-central1"
SERVICE="almuerzo-integraciones"
JOB="integraciones-sync"

SERVICE_URL=$(gcloud run services describe "$SERVICE" --region="$REGION" --format="value(status.url)")
[[ -n "$SERVICE_URL" ]] || { echo "ERROR: no se pudo obtener la URL del servicio '$SERVICE'." >&2; exit 1; }
CRON_SECRET=$(gcloud secrets versions access latest --secret="cron-secret")
[[ -n "$CRON_SECRET" ]] || { echo "ERROR: no se pudo leer el secreto 'cron-secret'." >&2; exit 1; }

ARGS=(
  --location="$REGION"
  --schedule="*/3 * * * *"
  --time-zone="America/Santiago"
  --uri="$SERVICE_URL/api/cron/sync"
  --http-method=GET
  --headers="Authorization=Bearer $CRON_SECRET"
  --attempt-deadline="120s"
  --description="Sincroniza el menú de los sistemas externos conectados (FUDO) hacia almuerzo.cl"
)

if gcloud scheduler jobs describe "$JOB" --location="$REGION" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "$JOB" "${ARGS[@]}" && echo "✓ Job '$JOB' actualizado (estado sin cambios)"
else
  gcloud scheduler jobs create http "$JOB" "${ARGS[@]}" && gcloud scheduler jobs pause "$JOB" --location="$REGION" && echo "✓ Job '$JOB' creado PAUSADO"
fi
