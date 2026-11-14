#!/usr/bin/env bash
# Backup do PostgreSQL (formato custom, compactado) com retenção.
#   DATABASE_URL=... BACKUP_DIR=/backups RETENTION_DAYS=14 scripts/backup.sh
# Recomendado: agendar (cron/systemd timer) e copiar para armazenamento externo
# (S3 compatível) com criptografia do lado do servidor.
set -euo pipefail
: "${DATABASE_URL:?defina DATABASE_URL}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
FILE="$BACKUP_DIR/livearena-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --dbname="${DATABASE_URL%%\?*}" --file="$FILE"
chmod 600 "$FILE"
pg_restore --list "$FILE" > /dev/null   # valida o arquivo
find "$BACKUP_DIR" -name 'livearena-*.dump' -mtime +"$RETENTION_DAYS" -delete
echo "Backup criado e verificado: $FILE"
