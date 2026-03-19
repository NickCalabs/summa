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

  if (errors.length > 0) {
    const message =
      "[startup] Missing required environment variables:\n\n" +
      errors.map((e) => `  - ${e}`).join("\n\n");
    throw new Error(message);
  }
}
