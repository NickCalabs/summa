import { NextResponse } from "next/server";
import postgres from "postgres";
import fs from "fs";
import path from "path";

function getAppVersion(): string {
  try {
    const pkgPath = path.join(process.cwd(), "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
      version?: string;
    };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function countMigrationsInJournal(): number {
  try {
    const dockerPath = "/app/migrations/meta/_journal.json";
    const localPath = path.join(
      process.cwd(),
      "src/lib/db/migrations/meta/_journal.json"
    );
    const journalPath = fs.existsSync(dockerPath) ? dockerPath : localPath;
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8")) as {
      entries?: unknown[];
    };
    return journal.entries?.length ?? 0;
  } catch {
    return 0;
  }
}

const APP_VERSION = getAppVersion();

export async function GET() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return NextResponse.json(
      {
        ok: false,
        db: "error",
        error: "DATABASE_URL not configured",
        version: APP_VERSION,
      },
      { status: 503 }
    );
  }

  let sql: ReturnType<typeof postgres> | null = null;
  try {
    sql = postgres(connectionString, {
      max: 1,
      connect_timeout: 1,
      idle_timeout: 2,
    });

    // DB probe with 250ms hard timeout
    await Promise.race([
      sql`SELECT 1`,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("DB probe timed out after 250ms")), 250)
      ),
    ]);

    // Check migration status (warning only — does not affect ok/503)
    let migrationsPending: number | undefined;
    const totalMigrations = countMigrationsInJournal();
    if (totalMigrations > 0) {
      try {
        const [row] = await sql<
          [{ count: number }]
        >`SELECT COUNT(*)::int AS count FROM drizzle.__drizzle_migrations`;
        const pending = Math.max(0, totalMigrations - row.count);
        if (pending > 0) migrationsPending = pending;
      } catch {
        // Migration table not yet created — all migrations pending
        migrationsPending = totalMigrations;
      }
    }

    const response: Record<string, unknown> = {
      ok: true,
      db: "ok",
      version: APP_VERSION,
    };
    if (migrationsPending !== undefined) {
      response.migrationsPending = migrationsPending;
    }

    return NextResponse.json(response);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown DB error";
    return NextResponse.json(
      { ok: false, db: "error", error, version: APP_VERSION },
      { status: 503 }
    );
  } finally {
    if (sql) sql.end().catch(() => {});
  }
}
