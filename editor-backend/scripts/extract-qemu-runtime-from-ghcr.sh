#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
QEMU_DIR="${ROOT}/prebuilt/qemu"
IMAGE="${VELXIO_RUNTIME_IMAGE:-ghcr.io/davidmonterocrespo24/velxio:master}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to extract ESP32 QEMU runtime files." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is installed, but the daemon is not running." >&2
  echo "Start Docker, then rerun: bun run editor:qemu:extract" >&2
  exit 1
fi

mkdir -p "${QEMU_DIR}"

echo "Pulling ${IMAGE}..."
docker pull "${IMAGE}"

container_id="$(docker create "${IMAGE}")"
cleanup() {
  docker rm "${container_id}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

runtime_files=(
  libqemu-xtensa.so
  libqemu-riscv32.so
  esp32-v3-rom.bin
  esp32-v3-rom-app.bin
  esp32c3-rom.bin
)

for file in "${runtime_files[@]}"; do
  echo "Extracting ${file}..."
  docker cp "${container_id}:/app/lib/${file}" "${QEMU_DIR}/${file}"
done

"${ROOT}/scripts/check-qemu-runtime.sh"
