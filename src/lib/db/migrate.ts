import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "path";
import fs from "fs";

const url = process.env.DATABASE_URL!;

async function runMigrations() {
  console.log("[migrate] Running database migrations...");

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  // Docker path takes precedence, fallback to local dev path
  const dockerPath = "/app/migrations";
  const localPath = path.join(process.cwd(), "src/lib/db/migrations");
  const migrationsFolder = fs.existsSync(dockerPath) ? dockerPath : localPath;

  console.log(`[migrate] Using migrations from: ${migrationsFolder}`);

  await migrate(db, { migrationsFolder });

  console.log("[migrate] Migrations complete!");
  await client.end();
}

runMigrations().catch((err) => {
  console.error("[migrate] Migration failed:", err);
  process.exit(1);
});
