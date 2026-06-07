#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
QEMU_DIR="${ROOT}/prebuilt/qemu"
IMAGE="${VELXIO_RUNTIME_IMAGE:-ghcr.io/davidmonterocrespo24/velxio:master}"

mkdir -p "${QEMU_DIR}"

echo "Pulling ${IMAGE}..."
docker pull "${IMAGE}"

cid="$(docker create "${IMAGE}")"
cleanup() {
  docker rm "${cid}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

files=(
  libqemu-xtensa.so
  libqemu-riscv32.so
  esp32-v3-rom.bin
  esp32-v3-rom-app.bin
  esp32c3-rom.bin
)

for file in "${files[@]}"; do
  docker cp "${cid}:/app/lib/${file}" "${QEMU_DIR}/${file}"
done

"${ROOT}/scripts/check-qemu-runtime.sh"
