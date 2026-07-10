/**
 * Bun preload that stubs Next's `server-only` / `client-only` marker modules so
 * operational scripts (which import app modules like the db client) can run
 * outside the Next build. Use with:
 *
 *   bun --preload ./scripts/_stub-server-only.ts run scripts/<name>.ts
 */
import { plugin } from "bun";

plugin({
  name: "stub-server-only",
  setup(build) {
    // Virtual modules for exact specifiers Next resolves internally but that
    // don't exist on disk for a plain Bun run.
    build.module("server-only", () => ({ exports: {}, loader: "object" }));
    build.module("client-only", () => ({ exports: {}, loader: "object" }));
  },
});
