export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { runMigrations } = await import("@/lib/db/migrate");
      await runMigrations();
    } catch {
      console.log("[instrumentation] skipping migrations, continuing startup");
    }
  }
}
