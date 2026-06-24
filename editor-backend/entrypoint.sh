#!/bin/sh
set -e

if [ ! -f /root/.arduino15/package_index.json ]; then
  echo "[entrypoint] configuring arduino-cli additional URLs..."
  arduino-cli config init
  arduino-cli config set board_manager.additional_urls \
    "http://drazzy.com/package_drazzy.com_index.json"

  echo "[entrypoint] updating core indexes..."
  arduino-cli core update-index

  echo "[entrypoint] installing Arduino AVR core..."
  arduino-cli core install arduino:avr

  echo "[entrypoint] Arduino CLI ready."
fi

echo "[entrypoint] starting editor backend on port ${PORT:-8001}"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8001}"
