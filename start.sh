#!/bin/sh
set -e

echo "Running database migrations..."
node /app/migrate.js

echo "Starting server..."
exec node /app/server.js
