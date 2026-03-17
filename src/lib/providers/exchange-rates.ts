import { db } from "@/lib/db";
import { exchangeRates } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { TtlCache } from "@/lib/providers/rate-limit-cache";

const cache = new TtlCache<Record<string, number>>();
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function fetchExchangeRates(
  base: string
): Promise<Record<string, number>> {
  const res = await fetch(
    `https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}`
  );
  if (!res.ok) {
    throw new Error(`Frankfurter API error: ${res.status}`);
  }
  const data = await res.json();
  return data.rates as Record<string, number>;
}

export async function getExchangeRates(
  base: string
): Promise<Record<string, number>> {
  // 1. Memory cache
  const cached = cache.get(base);
  if (cached) return cached;

  // 2. Try API first, fall back to DB
  try {
    const rates = await fetchExchangeRates(base);
    cache.set(base, rates, TTL_MS);
    return rates;
  } catch {
    // 3. Fall back to DB
    const [row] = await db
      .select()
      .from(exchangeRates)
      .where(eq(exchangeRates.base, base))
      .limit(1);

    if (row) {
      cache.set(base, row.rates, TTL_MS);
      return row.rates;
    }

    console.error(
      `[exchange-rates] All rate sources failed for base ${base}. Cannot convert currencies.`
    );
    throw new Error(
      `[exchange-rates] All rate sources failed for base ${base}. Cannot convert currencies.`
    );
  }
}

export async function refreshAndStoreRates(
  base: string
): Promise<Record<string, number>> {
  const rates = await fetchExchangeRates(base);

  await db
    .insert(exchangeRates)
    .values({ base, rates, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: exchangeRates.base,
      set: { rates, fetchedAt: new Date() },
    });

  cache.set(base, rates, TTL_MS);
  return rates;
}
