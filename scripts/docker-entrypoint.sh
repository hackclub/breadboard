#!/bin/sh
set -e

echo "[entrypoint] starting Next.js server (migrations run via instrumentation)..."
exec node server.js
