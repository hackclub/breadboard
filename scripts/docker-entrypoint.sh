#!/bin/sh
set -e

echo "[entrypoint] running database migrations..."
node /app/scripts/run-migrations.mjs

echo "[entrypoint] starting Next.js server..."
exec node server.js
