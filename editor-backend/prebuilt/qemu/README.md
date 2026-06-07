# ESP32 QEMU Runtime

Put these files here to build the Docker backend without download credentials:

- `libqemu-xtensa.so`
- `libqemu-riscv32.so`
- `esp32-v3-rom.bin`
- `esp32-v3-rom-app.bin`
- `esp32c3-rom.bin`

Alternative Docker build inputs:

- `VELXIO_LICENSE_KEY`
- `QEMU_RELEASE_URL`

For local development, you can also extract these files from the public Velxio
Docker image without running the Velxio frontend in Docker:

```bash
bun run editor:qemu:extract
```

This copies files from `ghcr.io/davidmonterocrespo24/velxio:master` by default.
Override with `VELXIO_RUNTIME_IMAGE` if needed.

The backend Dockerfile copies this folder into `/app/lib` and sets:

- `QEMU_ESP32_LIB=/app/lib/libqemu-xtensa.so`
- `QEMU_RISCV32_LIB=/app/lib/libqemu-riscv32.so`
- `VELXIO_QEMU_PATH=/app/lib`
