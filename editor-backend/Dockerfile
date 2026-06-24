# ---- Stage 0: ESP32 QEMU runtime provider ----
FROM ubuntu:22.04 AS qemu-provider

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ARG TARGETARCH
ARG VELXIO_LICENSE_KEY=
ARG VELXIO_BINARY_BASE_URL=https://velxio.dev/api/pro/license/downloads
ARG QEMU_RELEASE_URL=

RUN mkdir -p /qemu
COPY prebuilt/qemu/ /qemu/

RUN cd /qemu \
 && have_libs=1 && for base in libqemu-xtensa libqemu-riscv32; do \
      [ -f "${base}.so" ] || have_libs=0 ; \
    done \
 && if [ "$have_libs" = "1" ]; then \
      echo "[qemu-provider] using local prebuilt/qemu files" ; \
    elif [ -n "${QEMU_RELEASE_URL}" ]; then \
      echo "[qemu-provider] using QEMU_RELEASE_URL=${QEMU_RELEASE_URL}" ; \
    elif [ -n "${VELXIO_LICENSE_KEY}" ]; then \
      echo "[qemu-provider] using velxio.dev license downloads" ; \
    else \
      echo "ERROR: ESP32 emulation needs libqemu-xtensa.so and libqemu-riscv32.so." ; \
      echo "Put prebuilt files in editor-backend/prebuilt/qemu, or set VELXIO_LICENSE_KEY, or set QEMU_RELEASE_URL." ; \
      exit 1 ; \
    fi

RUN cd /qemu \
 && for base in libqemu-xtensa libqemu-riscv32; do \
      f="${base}.so" ; \
      if [ -f "$f" ]; then \
        echo "Using local $f" ; \
      elif [ -n "${QEMU_RELEASE_URL}" ]; then \
        curl -fSL -o "$f" "${QEMU_RELEASE_URL}/${base}-${TARGETARCH}.so" ; \
      else \
        curl -fSL -o "$f" "${VELXIO_BINARY_BASE_URL}/${base}-${TARGETARCH}?key=${VELXIO_LICENSE_KEY}" ; \
      fi ; \
    done \
 && for f in esp32-v3-rom.bin esp32-v3-rom-app.bin esp32c3-rom.bin; do \
      asset="${f%.bin}" ; \
      if [ -f "$f" ]; then \
        echo "Using local $f" ; \
      elif [ -n "${QEMU_RELEASE_URL}" ]; then \
        curl -fSL -o "$f" "${QEMU_RELEASE_URL}/$f" ; \
      else \
        curl -fSL -o "$f" "${VELXIO_BINARY_BASE_URL}/${asset}?key=${VELXIO_LICENSE_KEY}" ; \
      fi ; \
    done

# ---- Stage 1: ESP-IDF toolchain ----
FROM ubuntu:22.04 AS espidf-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    git wget flex bison gperf python3 python3-pip python3-venv \
    cmake ninja-build ccache libffi-dev libssl-dev \
    libusb-1.0-0 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN git clone -b v4.4.7 --recursive --depth=1 --shallow-submodules \
    https://github.com/espressif/esp-idf.git /opt/esp-idf

WORKDIR /opt/esp-idf
RUN ./install.sh esp32,esp32c3
RUN rm -rf .git docs examples \
    && find /root/.espressif -name '*.tar.*' -delete 2>/dev/null || true

RUN git clone --branch 2.0.17 --depth=1 --recursive --shallow-submodules \
    https://github.com/espressif/arduino-esp32.git /opt/arduino-esp32 \
 && rm -rf /opt/arduino-esp32/.git

# ---- Stage 2: Backend runtime ----
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates git cmake ninja-build ccache libusb-1.0-0 \
    libglib2.0-0 libgcrypt20 libslirp0 libpixman-1-0 libfdt1 \
    qemu-system-arm qemu-utils sdcc xz-utils \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir packaging

RUN curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh \
    | BINDIR=/usr/local/bin sh

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/
COPY sdk/ ./sdk/

RUN mkdir -p /app/lib /app/data /root/Arduino /var/cache/ccache /var/lib/velxio-build
COPY --from=qemu-provider /qemu/ /app/lib/

COPY --from=espidf-builder /opt/esp-idf /opt/esp-idf
COPY --from=espidf-builder /root/.espressif /root/.espressif
COPY --from=espidf-builder /opt/arduino-esp32 /opt/arduino-esp32

ENV QEMU_ESP32_LIB=/app/lib/libqemu-xtensa.so
ENV QEMU_RISCV32_LIB=/app/lib/libqemu-riscv32.so
ENV VELXIO_QEMU_PATH=/app/lib
ENV IDF_PATH=/opt/esp-idf
ENV IDF_TOOLS_PATH=/root/.espressif
ENV ARDUINO_ESP32_PATH=/opt/arduino-esp32
ENV CCACHE_DIR=/var/cache/ccache
ENV IDF_CCACHE_ENABLE=1
ENV CCACHE_BASEDIR=/var/lib/velxio-build
ENV CCACHE_MAXSIZE=8G
ENV CCACHE_COMPRESS=1
ENV CCACHE_COMPRESSLEVEL=6
ENV VELXIO_PERSISTENT_BUILD_DIR=1
ENV FRONTEND_URL=http://localhost:3000
ENV PORT=8001

RUN grep -v 'esp-windows-curses' /opt/esp-idf/requirements.txt \
    | pip install --no-cache-dir -r /dev/stdin

VOLUME ["/app/data", "/root/.arduino15", "/root/Arduino", "/var/cache/ccache", "/var/lib/velxio-build"]
EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=90s \
  CMD curl -f "http://localhost:${PORT:-8001}/health" || exit 1

CMD ["sh", "-c", "echo \"[entrypoint] starting editor backend on port ${PORT:-8001}\" && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8001}"]
