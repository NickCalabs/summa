import { requireAuth, jsonResponse, handleError } from "@/lib/api-helpers";
import { yahooProvider } from "@/lib/providers/yahoo";
import { coingeckoProvider } from "@/lib/providers/coingecko";
import type { SearchResult } from "@/lib/providers/types";

export async function GET(request: Request) {
  try {
    await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) return jsonResponse([]);

    const [yahooResult, coingeckoResult] = await Promise.allSettled([
      yahooProvider.search(q),
      coingeckoProvider.search(q),
    ]);

    const yahooResults =
      yahooResult.status === "fulfilled" ? yahooResult.value : [];
    const coingeckoResults =
      coingeckoResult.status === "fulfilled" ? coingeckoResult.value : [];

    // Dedupe: prefer Yahoo for non-crypto, CoinGecko for crypto
    const seen = new Map<string, SearchResult>();
    for (const r of yahooResults) {
      seen.set(r.symbol.toLowerCase(), r);
    }
    for (const r of coingeckoResults) {
      const key = r.symbol.toLowerCase();
      const existing = seen.get(key);
      if (!existing || (r.type === "crypto" && existing.type !== "crypto")) {
        seen.set(key, r);
      }
    }

    const merged = Array.from(seen.values());
    const qLower = q.toLowerCase();

    // Sort: exact symbol matches first, then alphabetically by name
    merged.sort((a, b) => {
      const aExact = a.symbol.toLowerCase() === qLower ? 0 : 1;
      const bExact = b.symbol.toLowerCase() === qLower ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return a.name.localeCompare(b.name);
    });

    return jsonResponse(merged.slice(0, 15));
  } catch (error) {
    return handleError(error);
  }
}
