#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
QEMU_DIR="${ROOT}/prebuilt/qemu"

required_files=(
  libqemu-xtensa.so
  libqemu-riscv32.so
  esp32-v3-rom.bin
  esp32-v3-rom-app.bin
  esp32c3-rom.bin
)

missing=()
for file in "${required_files[@]}"; do
  if [[ ! -f "${QEMU_DIR}/${file}" ]]; then
    missing+=("${file}")
  fi
done

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "Missing ESP32 QEMU runtime files in ${QEMU_DIR}:"
  printf '  - %s\n' "${missing[@]}"
  echo
  echo "Fix by doing one of these:"
  echo "  1. Run: bun run editor:qemu:extract"
  echo "  2. Put those files in editor-backend/prebuilt/qemu/."
  echo "  3. Set VELXIO_LICENSE_KEY before docker build."
  echo "  4. Set QEMU_RELEASE_URL before docker build."
  exit 1
fi

echo "ESP32 QEMU runtime files are ready in ${QEMU_DIR}."
