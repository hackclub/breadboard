#!/bin/sh
set -e

if [ ! -f /root/.arduino15/package_index.json ]; then
  echo "[entrypoint] initializing Arduino CLI indexes..."
  arduino-cli core update-index
fi

if [ ! -f /root/.arduino15/package_index.json.bundled ]; then
  echo "[entrypoint] installing Arduino AVR core..."
  arduino-cli core install arduino:avr
  echo "[entrypoint] copying package index..."
  cp /root/.arduino15/package_index.json /root/.arduino15/package_index.json.bundled 2>/dev/null || true
fi

echo "[entrypoint] starting editor backend on port ${PORT:-8001}"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8001}"
