import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import { auth } from "../auth";

const url = process.env.DATABASE_URL || "postgres://summa:summa@localhost:5432/summa";

async function createCathy() {
  const client = postgres(url);
  const db = drizzle(client, { schema });

  console.log("Creating account for Cathy...");

  const ctx = await auth.api.signUpEmail({
    body: {
      email: "cathy@summa.local",
      password: "ilovenick",
      name: "Cathy",
    },
  });

  const userId = ctx.user.id;
  console.log(`Created user: ${userId}`);

  await db
    .update(schema.user)
    .set({ defaultCurrency: "USD" })
    .where(eq(schema.user.id, userId));

  const [portfolio] = await db
    .insert(schema.portfolios)
    .values({
      userId,
      name: "Net Worth",
      currency: "USD",
    })
    .returning();

  console.log(`Created portfolio: ${portfolio.id}`);

  // Scaffold empty sheets + sections — we'll populate after Nick shares the data
  const sheetDefs = [
    { name: "Cash & Savings", type: "assets" as const, sortOrder: 0 },
    { name: "Investments & Retirement", type: "assets" as const, sortOrder: 1 },
    { name: "Real Estate", type: "assets" as const, sortOrder: 2 },
    { name: "Insurance & Benefits", type: "assets" as const, sortOrder: 3 },
    { name: "Debts", type: "debts" as const, sortOrder: 4 },
  ];

  for (const def of sheetDefs) {
    const [sheet] = await db
      .insert(schema.sheets)
      .values({ portfolioId: portfolio.id, name: def.name, type: def.type, sortOrder: def.sortOrder })
      .returning();

    await db
      .insert(schema.sections)
      .values({ sheetId: sheet.id, name: "Accounts", sortOrder: 0 });

    console.log(`Created sheet: ${def.name}`);
  }

  await client.end();
  console.log("\nDone! Cathy can log in at /login with:");
  console.log("  Email: cathy@summa.local");
  console.log("  Password: ilovenick");
}

createCathy().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
