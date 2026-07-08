#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
QEMU_DIR="${ROOT}/prebuilt/qemu"
IMAGE="${VELXIO_RUNTIME_IMAGE:-ghcr.io/davidmonterocrespo24/velxio:master}"
PLATFORMS="${VELXIO_RUNTIME_PLATFORMS:-linux/amd64 linux/arm64}"

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

shared_libs=(
  libqemu-xtensa.so
  libqemu-riscv32.so
)

runtime_bins=(
  esp32-v3-rom.bin
  esp32-v3-rom-app.bin
  esp32c3-rom.bin
)

copied_bins=0
container_ids=()
cleanup() {
  if [[ ${#container_ids[@]} -gt 0 ]]; then
    docker rm "${container_ids[@]}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

for platform in ${PLATFORMS}; do
  arch="${platform#linux/}"
  echo "Pulling ${IMAGE} for ${platform}..."
  docker pull --platform "${platform}" "${IMAGE}"

  container_id="$(docker create --platform "${platform}" "${IMAGE}")"
  container_ids+=("${container_id}")

  for file in "${shared_libs[@]}"; do
    base="${file%.so}"
    echo "Extracting ${file} for ${arch}..."
    docker cp "${container_id}:/app/lib/${file}" "${QEMU_DIR}/${base}-${arch}.so"
  done

  if [[ "${copied_bins}" = "0" ]]; then
    for file in "${runtime_bins[@]}"; do
      echo "Extracting ${file}..."
      docker cp "${container_id}:/app/lib/${file}" "${QEMU_DIR}/${file}"
    done
    copied_bins=1
  fi
done

"${ROOT}/scripts/check-qemu-runtime.sh"
