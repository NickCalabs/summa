import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and } from "drizzle-orm";
import * as schema from "./schema";

const url = process.env.DATABASE_URL || "postgres://summa:summa@localhost:5432/summa";

async function populate() {
  const client = postgres(url);
  const db = drizzle(client, { schema });

  // Find Cathy's portfolio
  const [cathy] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, "cathy@summa.local"));

  if (!cathy) throw new Error("Cathy's account not found");

  const [portfolio] = await db
    .select()
    .from(schema.portfolios)
    .where(eq(schema.portfolios.userId, cathy.id));

  if (!portfolio) throw new Error("Portfolio not found");

  console.log(`Found portfolio: ${portfolio.id}`);

  // Get existing sheets
  const existingSheets = await db
    .select()
    .from(schema.sheets)
    .where(eq(schema.sheets.portfolioId, portfolio.id));

  const sheetByName = Object.fromEntries(existingSheets.map((s) => [s.name, s]));

  // Get existing sections and rename them
  for (const sheet of existingSheets) {
    const [section] = await db
      .select()
      .from(schema.sections)
      .where(eq(schema.sections.sheetId, sheet.id));

    if (section) {
      const renameMap: Record<string, string> = {
        "Cash & Savings": "Liquid Assets",
        "Real Estate": "Properties",
        "Debts": "Mortgages",
        "Insurance & Benefits": "Policies",
      };
      if (renameMap[sheet.name]) {
        await db
          .update(schema.sections)
          .set({ name: renameMap[sheet.name] })
          .where(eq(schema.sections.id, section.id));
      }
    }
  }

  // Helper: get or create section
  async function getSection(sheetName: string, sectionName: string, sortOrder = 0) {
    const sheet = sheetByName[sheetName];
    if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);

    const existing = await db
      .select()
      .from(schema.sections)
      .where(and(eq(schema.sections.sheetId, sheet.id), eq(schema.sections.name, sectionName)));

    if (existing.length > 0) return existing[0].id;

    const [created] = await db
      .insert(schema.sections)
      .values({ sheetId: sheet.id, name: sectionName, sortOrder })
      .returning();
    return created.id;
  }

  // ── Sections ──
  const liquidSection = await getSection("Cash & Savings", "Liquid Assets", 0);
  const taxableSection = await getSection("Investments & Retirement", "Taxable", 0);
  const retirementSection = await getSection("Investments & Retirement", "Retirement", 1);
  const propertiesSection = await getSection("Real Estate", "Properties", 0);
  const mortgageSection = await getSection("Debts", "Mortgages", 0);

  // Remove the default "Accounts" section from Investments & Retirement (we created specific ones)
  const investSheet = sheetByName["Investments & Retirement"];
  if (investSheet) {
    await db
      .delete(schema.sections)
      .where(
        and(
          eq(schema.sections.sheetId, investSheet.id),
          eq(schema.sections.name, "Accounts")
        )
      );
  }

  console.log("Sections ready");

  // ── LIQUID ASSETS ──
  const liquidAssets = [
    { name: "Checking Account", type: "cash", currentValue: "28000.00", isCashEquivalent: true, isInvestable: false, sortOrder: 0 },
    { name: "Savings Account", type: "cash", currentValue: "30000.00", isCashEquivalent: true, isInvestable: false, sortOrder: 1 },
    { name: "Amex HYSA", type: "cash", currentValue: "117000.00", isCashEquivalent: true, isInvestable: false, sortOrder: 2, notes: "3.2% APY" },
    { name: "Financial Advisor (Money Market/CD)", type: "cash", currentValue: "30000.00", isCashEquivalent: true, isInvestable: false, sortOrder: 3 },
    { name: "Cash on Hand", type: "cash", currentValue: "10000.00", isCashEquivalent: true, isInvestable: false, sortOrder: 4 },
    { name: "Life Insurance Payout (Pending)", type: "other", currentValue: "35000.00", isCashEquivalent: false, isInvestable: false, sortOrder: 5, notes: "Dad's employer policy — pending payout" },
  ];

  for (const a of liquidAssets) {
    await db.insert(schema.assets).values({ sectionId: liquidSection, currency: "USD", providerType: "manual", ...a });
  }
  console.log(`Inserted ${liquidAssets.length} liquid assets`);

  // ── TAXABLE INVESTMENTS ──
  const taxableAssets = [
    { name: "AIG (Dad's Sick Day Payout)", type: "investment", currentValue: "70000.00", isInvestable: false, sortOrder: 0, taxStatus: "taxable" as const, notes: "Tax due on withdrawal" },
    { name: "Coinbase (Crypto)", type: "crypto", currentValue: "10000.00", isInvestable: true, sortOrder: 1, taxStatus: "taxable" as const },
  ];

  for (const a of taxableAssets) {
    await db.insert(schema.assets).values({ sectionId: taxableSection, currency: "USD", providerType: "manual", ...a });
  }
  console.log(`Inserted ${taxableAssets.length} taxable investments`);

  // ── RETIREMENT ACCOUNTS ──
  const retirementAssets = [
    { name: "Empower 403(b)", type: "investment", currentValue: "109000.00", isInvestable: true, sortOrder: 0, taxStatus: "tax_deferred" as const, notes: "14% return" },
    { name: "Voya 403(b)", type: "investment", currentValue: "26000.00", isInvestable: true, sortOrder: 1, taxStatus: "tax_deferred" as const, notes: "Underperforming (4.5% return) — review allocation" },
  ];

  for (const a of retirementAssets) {
    await db.insert(schema.assets).values({ sectionId: retirementSection, currency: "USD", providerType: "manual", ...a });
  }
  console.log(`Inserted ${retirementAssets.length} retirement accounts`);

  // ── REAL ESTATE ──
  const [primaryHome] = await db
    .insert(schema.assets)
    .values({
      sectionId: propertiesSection,
      name: "Primary Home",
      type: "real_estate",
      currency: "USD",
      currentValue: "700000.00",
      isInvestable: false,
      isCashEquivalent: false,
      providerType: "manual",
      sortOrder: 0,
    })
    .returning();

  await db.insert(schema.assets).values({
    sectionId: propertiesSection,
    name: "Beach House",
    type: "real_estate",
    currency: "USD",
    currentValue: "640000.00",
    isInvestable: false,
    isCashEquivalent: false,
    providerType: "manual",
    sortOrder: 1,
    notes: "Paid off",
  });

  await db.insert(schema.assets).values({
    sectionId: propertiesSection,
    name: "Vacant Lot — Palm Bay, FL",
    type: "land",
    currency: "USD",
    currentValue: "40000.00",
    isInvestable: false,
    isCashEquivalent: false,
    providerType: "manual",
    sortOrder: 2,
  });

  console.log("Inserted 3 real estate properties");

  // ── DEBTS ──
  const [mortgage] = await db
    .insert(schema.assets)
    .values({
      sectionId: mortgageSection,
      name: "Primary Home Mortgage",
      type: "real_estate",
      currency: "USD",
      currentValue: "225000.00",
      isInvestable: false,
      isCashEquivalent: false,
      providerType: "manual",
      sortOrder: 0,
    })
    .returning();

  console.log("Inserted mortgage debt");

  // ── Link mortgage to primary home ──
  await db
    .update(schema.assets)
    .set({ linkedDebtId: mortgage.id })
    .where(eq(schema.assets.id, primaryHome.id));

  console.log("Linked mortgage to primary home");

  // ── Create initial portfolio snapshot ──
  const today = new Date().toISOString().split("T")[0];
  const totalAssets = 28000 + 30000 + 117000 + 30000 + 10000 + 35000 + 70000 + 10000 + 109000 + 26000 + 700000 + 640000 + 40000;
  const totalDebts = 225000;

  await db.insert(schema.portfolioSnapshots).values({
    portfolioId: portfolio.id,
    date: today,
    totalAssets: totalAssets.toFixed(2),
    totalDebts: totalDebts.toFixed(2),
    netWorth: (totalAssets - totalDebts).toFixed(2),
    cashOnHand: (28000 + 30000 + 117000 + 30000 + 10000).toFixed(2),
  });

  console.log("Created initial snapshot");

  console.log("\n=== Summary ===");
  console.log(`Total Assets: $${totalAssets.toLocaleString()}`);
  console.log(`Total Debts:  $${totalDebts.toLocaleString()}`);
  console.log(`Net Worth:    $${(totalAssets - totalDebts).toLocaleString()}`);
  console.log(`Cash on Hand: $${(28000 + 30000 + 117000 + 30000 + 10000).toLocaleString()}`);

  await client.end();
  console.log("\nDone!");
}

populate().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
