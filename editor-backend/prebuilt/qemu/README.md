# ESP32 QEMU Runtime

Put these files here to build the Docker backend without download credentials:

- `libqemu-xtensa-amd64.so`
- `libqemu-riscv32-amd64.so`
- `libqemu-xtensa-arm64.so`
- `libqemu-riscv32-arm64.so`
- `esp32-v3-rom.bin`
- `esp32-v3-rom-app.bin`
- `esp32c3-rom.bin`

The Dockerfile copies the matching architecture file to the runtime names:

- `libqemu-xtensa.so`
- `libqemu-riscv32.so`

Alternative Docker build inputs:

- `VELXIO_LICENSE_KEY`
- `QEMU_RELEASE_URL`

For local development, you can also extract these files from the public Velxio
Docker image without running the Velxio frontend in Docker:

```bash
bun run editor:qemu:extract
```

This copies files from `ghcr.io/davidmonterocrespo24/velxio:master` by default.
Override with `VELXIO_RUNTIME_IMAGE` if needed. For production, extract both
`linux/amd64` and `linux/arm64` variants and keep the architecture suffixes
above.

The backend Dockerfile copies this folder into `/app/lib` and sets:

- `QEMU_ESP32_LIB=/app/lib/libqemu-xtensa.so`
- `QEMU_RISCV32_LIB=/app/lib/libqemu-riscv32.so`
- `VELXIO_QEMU_PATH=/app/lib`
