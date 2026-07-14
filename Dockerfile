# syntax=docker/dockerfile:1
# ---- Stage 1: Build ----
FROM oven/bun:1.3.6 AS builder
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Deploying commit, stamped into the build for Server Action version-skew
# protection (see next.config.ts). Empty in local builds, which disables it.
ARG NEXT_DEPLOYMENT_ID=""
ENV NEXT_DEPLOYMENT_ID=$NEXT_DEPLOYMENT_ID
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_OUTPUT_STANDALONE=1
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
# Pin the Server Actions encryption key so actions stay decryptable across
# redeploys. Delivered as a BuildKit secret (not a build-arg, which would leak
# into image history). Absent locally, so the build falls back to a per-build
# key exactly as before.
RUN --mount=type=secret,id=next_server_actions_key \
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$(cat /run/secrets/next_server_actions_key 2>/dev/null || true)" \
    bun run build

# ---- Stage 2: Runtime ----
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts ./scripts

RUN chmod +x scripts/docker-entrypoint.sh \
 && chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
