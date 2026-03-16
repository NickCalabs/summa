import postgres from "postgres";
import { execSync } from "child_process";

async function reset() {
  const url = process.env.DATABASE_URL || "postgres://summa:summa@localhost:5432/summa";
  const sql = postgres(url);

  console.log("Dropping public schema...");
  await sql.unsafe("DROP SCHEMA public CASCADE");
  await sql.unsafe("CREATE SCHEMA public");
  await sql.end();

  console.log("Running migrations...");
  execSync("pnpm db:migrate", { stdio: "inherit" });

  console.log("Seeding database...");
  execSync("pnpm db:seed", { stdio: "inherit" });

  console.log("Done!");
}

reset().catch((err) => {
  console.error(err);
  process.exit(1);
});
