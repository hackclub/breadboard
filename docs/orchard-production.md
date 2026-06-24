# Orchard Production

Production is built by GitHub Actions and run by native Orchard image
deployments. Do not import Compose into Orchard; Compose interpolation and
service defaults do not map cleanly.

## Deployments

- `prod-nextjs`
  - Source image: `ghcr.io/hackclub/breadboard:latest`
  - Built by `.github/workflows/build-images.yml` from `Dockerfile`
  - Container port: `3000`
  - Public ingress: `breadboard.hackclub.com`
  - Health check: `/api/health` on port `3000`

- `prod-editor-backend`
  - Source image: `ghcr.io/hackclub/breadboard-editor-backend:latest`
  - Built by `.github/workflows/build-images.yml` from
    `editor-backend/Dockerfile`
  - Container port: `8001`
  - Internal service: `prod-editor-backend:8001`
  - Health check: `/health` on port `8001`
  - PVC mounts:
    - `/app/data`
    - `/root/.arduino15`
    - `/root/Arduino`
    - `/var/cache/ccache`
    - `/tmp/velxio-builds`
    - `/var/lib/velxio-build`

- `breadboard-db`
  - Orchard-managed PostgreSQL database.
  - The Next.js deployment should use the Orchard database hostname directly,
    not the old Compose `postgres` hostname.

## Required Next.js env

```text
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0
DATABASE_SSL=false
BETTER_AUTH_URL=https://breadboard.hackclub.com
NEXT_PUBLIC_APP_URL=https://breadboard.hackclub.com
EDITOR_BACKEND_URL=http://prod-editor-backend:8001
NEXT_PUBLIC_EDITOR_BACKEND_URL=/api
```

Set `DATABASE_URL`, auth secrets, OAuth credentials, S3 credentials, and
GrowthBook values in Orchard as real values. Do not paste Compose expressions
such as `${VAR:-fallback}` into Orchard env vars.

## Required editor backend env

```text
PORT=8001
FRONTEND_URL=https://breadboard.hackclub.com
VELXIO_PERSISTENT_BUILD_DIR=1
IDF_CCACHE_ENABLE=1
```
