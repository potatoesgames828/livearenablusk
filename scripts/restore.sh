#!/usr/bin/env bash
# Restaura um backup em um banco (ATENÇÃO: substitui os dados do banco de destino).
#   DATABASE_URL=... scripts/restore.sh backups/livearena-XXXX.dump
set -euo pipefail
: "${DATABASE_URL:?defina DATABASE_URL}"
FILE="${1:?informe o arquivo .dump}"
read -r -p "Isto vai SUBSTITUIR os dados em ${DATABASE_URL%%@*}@… Digite RESTAURAR para continuar: " ok
[ "$ok" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }
pg_restore --clean --if-exists --no-owner --dbname="${DATABASE_URL%%\?*}" "$FILE"
echo "Restauração concluída. Reinicie os serviços para reconstruir caches (Redis)."
