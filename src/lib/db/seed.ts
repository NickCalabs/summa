import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import { auth } from "../auth";

const url = process.env.DATABASE_URL || "postgres://summa:summa@localhost:5432/summa";

async function seed() {
  const client = postgres(url);
  const db = drizzle(client, { schema });

  console.log("Seeding database...");

  // ── Create user via Better Auth (hashes password properly) ──
  const ctx = await auth.api.signUpEmail({
    body: {
      email: "dev@summa.sh",
      password: "password",
      name: "Dev User",
    },
  });

  const userId = ctx.user.id;
  console.log(`Created user: ${userId}`);

  // Set default currency
  await db
    .update(schema.user)
    .set({ defaultCurrency: "USD" })
    .where(eq(schema.user.id, userId));

  // ── Portfolio ──
  const [portfolio] = await db
    .insert(schema.portfolios)
    .values({
      userId,
      name: "My Net Worth",
      currency: "USD",
    })
    .returning();

  console.log(`Created portfolio: ${portfolio.id}`);

  // ── Sheets ──
  const [cashSheet] = await db
    .insert(schema.sheets)
    .values({ portfolioId: portfolio.id, name: "Cash & Banking", type: "assets", sortOrder: 0 })
    .returning();

  const [techSheet] = await db
    .insert(schema.sheets)
    .values({ portfolioId: portfolio.id, name: "Tech Portfolio", type: "assets", sortOrder: 1 })
    .returning();

  const [cryptoSheet] = await db
    .insert(schema.sheets)
    .values({ portfolioId: portfolio.id, name: "Crypto", type: "assets", sortOrder: 2 })
    .returning();

  const [realEstateSheet] = await db
    .insert(schema.sheets)
    .values({ portfolioId: portfolio.id, name: "Real Estate", type: "assets", sortOrder: 3 })
    .returning();

  const [debtSheet] = await db
    .insert(schema.sheets)
    .values({ portfolioId: portfolio.id, name: "Debts", type: "debts", sortOrder: 4 })
    .returning();

  // ── Sections ──
  const [cashSection] = await db
    .insert(schema.sections)
    .values({ sheetId: cashSheet.id, name: "Accounts", sortOrder: 0 })
    .returning();

  const [stocksSection] = await db
    .insert(schema.sections)
    .values({ sheetId: techSheet.id, name: "Individual Stocks", sortOrder: 0 })
    .returning();

  const [retirementSection] = await db
    .insert(schema.sections)
    .values({ sheetId: techSheet.id, name: "Retirement", sortOrder: 1 })
    .returning();

  const [cryptoSection] = await db
    .insert(schema.sections)
    .values({ sheetId: cryptoSheet.id, name: "Holdings", sortOrder: 0 })
    .returning();

  const [propertySection] = await db
    .insert(schema.sections)
    .values({ sheetId: realEstateSheet.id, name: "Properties", sortOrder: 0 })
    .returning();

  const [debtSection] = await db
    .insert(schema.sections)
    .values({ sheetId: debtSheet.id, name: "Liabilities", sortOrder: 0 })
    .returning();

  // ── Assets ──
  const assetsData = [
    // Cash & Banking
    {
      sectionId: cashSection.id,
      name: "Checking",
      type: "cash",
      currency: "USD",
      currentValue: "15000.00",
      isCashEquivalent: true,
      isInvestable: false,
      sortOrder: 0,
    },
    {
      sectionId: cashSection.id,
      name: "High-Yield Savings",
      type: "cash",
      currency: "USD",
      currentValue: "85000.00",
      isCashEquivalent: true,
      isInvestable: false,
      sortOrder: 1,
    },
    {
      sectionId: cashSection.id,
      name: "Emergency Fund",
      type: "cash",
      currency: "USD",
      currentValue: "35000.00",
      isCashEquivalent: true,
      isInvestable: false,
      sortOrder: 2,
    },
    // Tech Portfolio — Individual Stocks
    {
      sectionId: stocksSection.id,
      name: "Apple",
      type: "stock",
      currency: "USD",
      quantity: "150.00000000",
      currentPrice: "178.00000000",
      currentValue: "26700.00",
      isInvestable: true,
      sortOrder: 0,
      providerType: "ticker" as const,
      providerConfig: { ticker: "AAPL", source: "yahoo" },
      lastSyncedAt: new Date(),
    },
    {
      sectionId: stocksSection.id,
      name: "Alphabet",
      type: "stock",
      currency: "USD",
      quantity: "80.00000000",
      currentPrice: "175.00000000",
      currentValue: "14000.00",
      isInvestable: true,
      sortOrder: 1,
      providerType: "ticker" as const,
      providerConfig: { ticker: "GOOGL", source: "yahoo" },
      lastSyncedAt: new Date(),
    },
    {
      sectionId: stocksSection.id,
      name: "Microsoft",
      type: "stock",
      currency: "USD",
      quantity: "60.00000000",
      currentPrice: "420.00000000",
      currentValue: "25200.00",
      isInvestable: true,
      sortOrder: 2,
      providerType: "ticker" as const,
      providerConfig: { ticker: "MSFT", source: "yahoo" },
      lastSyncedAt: new Date(),
    },
    {
      sectionId: stocksSection.id,
      name: "NVIDIA",
      type: "stock",
      currency: "USD",
      quantity: "200.00000000",
      currentPrice: "130.00000000",
      currentValue: "26000.00",
      isInvestable: true,
      sortOrder: 3,
      providerType: "ticker" as const,
      providerConfig: { ticker: "NVDA", source: "yahoo" },
      lastSyncedAt: new Date(),
    },
    // Tech Portfolio — Retirement
    {
      sectionId: retirementSection.id,
      name: "401(k)",
      type: "stock",
      currency: "USD",
      currentValue: "420000.00",
      isInvestable: true,
      sortOrder: 0,
    },
    {
      sectionId: retirementSection.id,
      name: "Roth IRA",
      type: "stock",
      currency: "USD",
      currentValue: "92000.00",
      isInvestable: true,
      sortOrder: 1,
    },
    // Crypto
    {
      sectionId: cryptoSection.id,
      name: "Bitcoin",
      type: "crypto",
      currency: "USD",
      quantity: "1.50000000",
      currentPrice: "85000.00000000",
      currentValue: "127500.00",
      isInvestable: true,
      sortOrder: 0,
      providerType: "ticker" as const,
      providerConfig: { ticker: "bitcoin", source: "coingecko" },
      lastSyncedAt: new Date(),
    },
    {
      sectionId: cryptoSection.id,
      name: "Ethereum",
      type: "crypto",
      currency: "USD",
      quantity: "12.00000000",
      currentPrice: "2800.00000000",
      currentValue: "33600.00",
      isInvestable: true,
      sortOrder: 1,
      providerType: "ticker" as const,
      providerConfig: { ticker: "ethereum", source: "coingecko" },
      lastSyncedAt: new Date(),
    },
    {
      sectionId: cryptoSection.id,
      name: "Solana",
      type: "crypto",
      currency: "USD",
      quantity: "100.00000000",
      currentPrice: "170.00000000",
      currentValue: "17000.00",
      isInvestable: true,
      sortOrder: 2,
      providerType: "ticker" as const,
      providerConfig: { ticker: "solana", source: "coingecko" },
      lastSyncedAt: new Date(),
    },
    // Real Estate
    {
      sectionId: propertySection.id,
      name: "Primary Residence",
      type: "real_estate",
      currency: "USD",
      currentValue: "650000.00",
      isInvestable: false,
      sortOrder: 0,
    },
    // Debts
    {
      sectionId: debtSection.id,
      name: "Mortgage",
      type: "real_estate",
      currency: "USD",
      currentValue: "420000.00",
      isInvestable: false,
      sortOrder: 0,
    },
    {
      sectionId: debtSection.id,
      name: "Student Loan",
      type: "other",
      currency: "USD",
      currentValue: "28000.00",
      isInvestable: false,
      sortOrder: 1,
    },
  ];

  const insertedAssets = await db
    .insert(schema.assets)
    .values(assetsData)
    .returning();

  console.log(`Created ${insertedAssets.length} assets`);

  // ── Portfolio Snapshots (90 days of history) ──
  // Target: Assets ~$1,567,000, Debts $448,000, Net Worth ~$1,119,000
  // Growth from ~$950K to ~$1.2M net worth over 90 days

  const today = new Date();
  const snapshots = [];

  const currentNetWorth = 1119000;
  const startNetWorth = 950000;
  const currentTotalAssets = 1567000;
  const startTotalAssets = 1350000;
  const currentTotalDebts = 448000;
  const startTotalDebts = 450000; // debts decrease slightly

  for (let day = 89; day >= 0; day--) {
    const date = new Date(today);
    date.setDate(date.getDate() - day);
    const dateStr = date.toISOString().split("T")[0];

    // Progress from 0 to 1
    const t = (89 - day) / 89;

    // Base growth (smooth sigmoid-ish)
    let growthFactor = t * t * (3 - 2 * t); // smoothstep

    // Add dips
    // Dip 1: around day 20 (t ≈ 0.22), ~4% dip
    const dip1 = 0.04 * Math.exp(-Math.pow((t - 0.22) / 0.03, 2));
    // Dip 2: around day 55 (t ≈ 0.38), ~3% dip
    const dip2 = 0.03 * Math.exp(-Math.pow((t - 0.38) / 0.03, 2));
    // Dip 3: around day 75 (t ≈ 0.84), ~5% dip
    const dip3 = 0.05 * Math.exp(-Math.pow((t - 0.84) / 0.04, 2));

    growthFactor = growthFactor - dip1 - dip2 - dip3;

    // Small daily noise (±0.3%)
    const noise = (Math.random() - 0.5) * 0.006;
    growthFactor = Math.max(0, Math.min(1, growthFactor + noise));

    const totalAssets = startTotalAssets + (currentTotalAssets - startTotalAssets) * growthFactor;
    const totalDebts = startTotalDebts + (currentTotalDebts - startTotalDebts) * growthFactor;
    const netWorth = totalAssets - totalDebts;

    // Cash on hand (relatively stable, slight growth)
    const cashOnHand = 125000 + 10000 * t + (Math.random() - 0.5) * 2000;

    snapshots.push({
      portfolioId: portfolio.id,
      date: dateStr,
      totalAssets: totalAssets.toFixed(2),
      totalDebts: totalDebts.toFixed(2),
      netWorth: netWorth.toFixed(2),
      cashOnHand: cashOnHand.toFixed(2),
    });
  }

  await db.insert(schema.portfolioSnapshots).values(snapshots);
  console.log(`Created ${snapshots.length} portfolio snapshots`);

  await client.end();
  console.log("Seed complete!");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
