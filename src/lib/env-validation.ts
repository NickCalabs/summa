const WEAK_SECRETS = new Set([
  "changeme",
  "secret",
  "your-secret-here",
  "change-me-to-a-random-secret",
  "change-me",
  "password",
  "1234567890123456789012345678901234567890",
]);

function isWeak(value: string): boolean {
  return value.length < 32 || WEAK_SECRETS.has(value.toLowerCase());
}

export function validateEnv(): void {
  if (process.env.NODE_ENV !== "production") return;

  const errors: string[] = [];

  const authSecret = process.env.BETTER_AUTH_SECRET;
  if (!authSecret) {
    errors.push("BETTER_AUTH_SECRET is required in production");
  } else if (isWeak(authSecret)) {
    errors.push(
      "BETTER_AUTH_SECRET is too weak — use a random string of at least 32 characters"
    );
  }

  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    errors.push(
      "ENCRYPTION_KEY is required in production — do not rely on the BETTER_AUTH_SECRET fallback"
    );
  } else if (encryptionKey.length !== 64 || !/^[0-9a-fA-F]+$/.test(encryptionKey)) {
    errors.push(
      "ENCRYPTION_KEY must be a 64-character hex string (32 bytes). Generate one with: openssl rand -hex 32"
    );
  } else if (isWeak(encryptionKey)) {
    errors.push(
      "ENCRYPTION_KEY is too weak — use a random 64-character hex string"
    );
  }

  if (errors.length > 0) {
    throw new Error(
      `Startup validation failed — weak or missing secrets detected in production:\n` +
        errors.map((e) => `  • ${e}`).join("\n") +
        `\n\nGenerate strong secrets with:\n  openssl rand -hex 32`
    );
  }
}

// Only validate at runtime, not during Next.js build
if (process.env.NEXT_PHASE !== "phase-production-build") {
  validateEnv();
}
