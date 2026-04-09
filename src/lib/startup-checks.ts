/**
 * Startup environment validation.
 * Called once during server initialization (instrumentation.ts).
 * Throws on fatal misconfigurations so the process exits with a clear error
 * instead of failing silently later.
 */
export function runStartupChecks(): void {
  const errors: string[] = [];

  // --- Required env vars ---
  if (!process.env.DATABASE_URL) {
    errors.push(
      "DATABASE_URL is not set. Provide a PostgreSQL connection string, e.g.:\n" +
        "  DATABASE_URL=postgres://user:password@host:5432/dbname"
    );
  }

  if (!process.env.BETTER_AUTH_SECRET) {
    errors.push(
      "BETTER_AUTH_SECRET is not set. Generate one with:\n" +
        "  openssl rand -base64 32"
    );
  }

  if (!process.env.BETTER_AUTH_URL) {
    errors.push(
      "BETTER_AUTH_URL is not set. Set it to your app's base URL, e.g.:\n" +
        "  BETTER_AUTH_URL=https://yourdomain.com"
    );
  }

  // ── Optional API keys (warn but don't block startup) ──
  if (!process.env.ETHERSCAN_API_KEY) {
    console.warn(
      "[startup] ETHERSCAN_API_KEY is not set — ETH wallet tracking will be disabled.\n" +
        "  Get a free key at https://etherscan.io/myapikey"
    );
  }

  if (errors.length > 0) {
    const message =
      "[startup] Missing required environment variables:\n\n" +
      errors.map((e) => `  - ${e}`).join("\n\n");
    throw new Error(message);
  }
}
