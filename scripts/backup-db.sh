#!/bin/bash
# Daily database backup for Summa
# Keeps last 30 days of backups

BACKUP_DIR="/opt/summa/backups"
TIMESTAMP=$(date +%Y-%m-%d_%H%M)
BACKUP_FILE="${BACKUP_DIR}/summa_${TIMESTAMP}.sql.gz"

# Dump via Docker container (Postgres runs in Docker)
docker exec summa-postgres pg_dump -U summa summa | gzip > "$BACKUP_FILE"

if [ $? -eq 0 ] && [ -s "$BACKUP_FILE" ]; then
    echo "Backup successful: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
    # Remove backups older than 30 days
    find "$BACKUP_DIR" -name "summa_*.sql.gz" -mtime +30 -delete
else
    echo "ERROR: Backup failed!" >&2
    rm -f "$BACKUP_FILE"
    exit 1
fi
