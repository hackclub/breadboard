#!/bin/sh
set -e

# Guard on the installed AVR core (not just the index file) so a partially
# failed first run retries instead of skipping the core install forever.
if [ ! -d /root/.arduino15/packages/arduino/hardware/avr ]; then
  echo "[entrypoint] configuring arduino-cli additional URLs..."
  arduino-cli config init --overwrite
  arduino-cli config set board_manager.additional_urls \
    "http://drazzy.com/package_drazzy.com_index.json"

  echo "[entrypoint] updating core indexes..."
  if ! arduino-cli core update-index; then
    # Third-party indexes go down (drazzy.com shipped an expired TLS cert
    # in June 2026). Fall back to the official index rather than refusing
    # to boot; ATTiny support just stays unavailable until it recovers.
    echo "[entrypoint] WARN: index update failed; retrying with official index only"
    arduino-cli config set board_manager.additional_urls ""
    arduino-cli core update-index
  fi

  echo "[entrypoint] installing Arduino AVR core..."
  arduino-cli core install arduino:avr

  echo "[entrypoint] Arduino CLI ready."
fi

echo "[entrypoint] starting editor backend on port ${PORT:-8001}"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8001}"
