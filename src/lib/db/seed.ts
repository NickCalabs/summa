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

  const [investSheet] = await db
    .insert(schema.sheets)
    .values({ portfolioId: portfolio.id, name: "Investments", type: "assets", sortOrder: 1 })
    .returning();

  const [cryptoSheet] = await db
    .insert(schema.sheets)
    .values({ portfolioId: portfolio.id, name: "Crypto", type: "assets", sortOrder: 2 })
    .returning();

  const [debtSheet] = await db
    .insert(schema.sheets)
    .values({ portfolioId: portfolio.id, name: "Debts", type: "debts", sortOrder: 3 })
    .returning();

  // ── Sections ──
  const [checkingSavings] = await db
    .insert(schema.sections)
    .values({ sheetId: cashSheet.id, name: "Checking & Savings", sortOrder: 0 })
    .returning();

  const [otherCash] = await db
    .insert(schema.sections)
    .values({ sheetId: cashSheet.id, name: "Other Cash", sortOrder: 1 })
    .returning();

  const [brokerage] = await db
    .insert(schema.sections)
    .values({ sheetId: investSheet.id, name: "Brokerage", sortOrder: 0 })
    .returning();

  const [retirement] = await db
    .insert(schema.sections)
    .values({ sheetId: investSheet.id, name: "Retirement", sortOrder: 1 })
    .returning();

  const [cryptoHoldings] = await db
    .insert(schema.sections)
    .values({ sheetId: cryptoSheet.id, name: "Holdings", sortOrder: 0 })
    .returning();

  const [cryptoDefi] = await db
    .insert(schema.sections)
    .values({ sheetId: cryptoSheet.id, name: "DeFi", sortOrder: 1 })
    .returning();

  const [mortgages] = await db
    .insert(schema.sections)
    .values({ sheetId: debtSheet.id, name: "Mortgages", sortOrder: 0 })
    .returning();

  const [loans] = await db
    .insert(schema.sections)
    .values({ sheetId: debtSheet.id, name: "Loans", sortOrder: 1 })
    .returning();

  // ── Assets ──
  const assetsData = [
    // Cash & Banking — Checking & Savings
    {
      sectionId: checkingSavings.id,
      name: "Chase Checking",
      type: "cash",
      currency: "USD",
      currentValue: "12500.00",
      isCashEquivalent: true,
      isInvestable: false,
      sortOrder: 0,
    },
    {
      sectionId: checkingSavings.id,
      name: "Marcus Savings",
      type: "cash",
      currency: "USD",
      currentValue: "50000.00",
      isCashEquivalent: true,
      isInvestable: false,
      sortOrder: 1,
    },
    // Cash & Banking — Other Cash
    {
      sectionId: otherCash.id,
      name: "Emergency Fund",
      type: "cash",
      currency: "USD",
      currentValue: "22500.00",
      isCashEquivalent: true,
      isInvestable: false,
      sortOrder: 0,
    },
    // Investments — Brokerage
    {
      sectionId: brokerage.id,
      name: "Schwab Brokerage",
      type: "stock",
      currency: "USD",
      currentValue: "85000.00",
      isInvestable: true,
      sortOrder: 0,
      providerType: "ticker" as const,
    },
    // Investments — Retirement
    {
      sectionId: retirement.id,
      name: "Fidelity 401k",
      type: "stock",
      currency: "USD",
      currentValue: "245000.00",
      isInvestable: true,
      sortOrder: 0,
    },
    // Crypto — Holdings
    {
      sectionId: cryptoHoldings.id,
      name: "Bitcoin",
      type: "crypto",
      currency: "USD",
      quantity: "0.65000000",
      currentPrice: "64615.38",
      currentValue: "42000.00",
      isInvestable: true,
      sortOrder: 0,
      providerType: "ticker" as const,
      providerConfig: { ticker: "bitcoin", source: "coingecko" },
    },
    {
      sectionId: cryptoHoldings.id,
      name: "Ethereum",
      type: "crypto",
      currency: "USD",
      quantity: "2.80000000",
      currentPrice: "3035.71",
      currentValue: "8500.00",
      isInvestable: true,
      sortOrder: 1,
      providerType: "ticker" as const,
      providerConfig: { ticker: "ethereum", source: "coingecko" },
    },
    {
      sectionId: cryptoHoldings.id,
      name: "Solana",
      type: "crypto",
      currency: "USD",
      quantity: "25.00000000",
      currentPrice: "128.00",
      currentValue: "3200.00",
      isInvestable: true,
      sortOrder: 2,
      providerType: "ticker" as const,
      providerConfig: { ticker: "solana", source: "coingecko" },
    },
    // Crypto — DeFi
    {
      sectionId: cryptoDefi.id,
      name: "Aave USDC Lending",
      type: "crypto",
      currency: "USD",
      currentValue: "5000.00",
      isInvestable: true,
      isCashEquivalent: true,
      sortOrder: 0,
    },
    // Debts — Mortgages
    {
      sectionId: mortgages.id,
      name: "Mortgage",
      type: "real_estate",
      currency: "USD",
      currentValue: "265000.00",
      isInvestable: false,
      sortOrder: 0,
    },
    // Debts — Loans
    {
      sectionId: loans.id,
      name: "Student Loan",
      type: "other",
      currency: "USD",
      currentValue: "18000.00",
      isInvestable: false,
      sortOrder: 0,
    },
  ];

  const insertedAssets = await db
    .insert(schema.assets)
    .values(assetsData)
    .returning();

  console.log(`Created ${insertedAssets.length} assets`);

  // ── Portfolio Snapshots (90 days of history) ──
  // Start ~$85K net worth, grow to ~$120K with 2-3 dips
  const today = new Date();
  const snapshots = [];

  // Calculate current net worth from seed data
  // Assets: 12500 + 50000 + 22500 + 85000 + 245000 + 42000 + 8500 + 3200 + 5000 = 473700
  // Debts: 265000 + 18000 = 283000
  // Net: 473700 - 283000 = 190700 (but spec says ~$120K target... let's use the actual seed values)
  // Actually the spec says "Start at ~$85K net worth 90 days ago, grow to ~$120K today"
  // But our seed data totals ~$190K. Let's use the actual seed data values and
  // build a realistic growth curve from 90 days ago.

  const currentNetWorth = 190700;
  const startNetWorth = 155000; // ~18% lower 90 days ago
  const currentTotalAssets = 473700;
  const startTotalAssets = 418000;
  const currentTotalDebts = 283000;
  const startTotalDebts = 283000; // debts stay roughly constant

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
    const cashOnHand = 80000 + 5000 * t + (Math.random() - 0.5) * 1000;

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
