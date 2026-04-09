import { db } from "@/lib/db";
import { assets, sections, sheets } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  requireAuth,
  requirePortfolioOwnership,
  jsonResponse,
  errorResponse,
  handleError,
  validateUuid,
} from "@/lib/api-helpers";
import { parseBody, createAsset } from "@/types";
import {
  isValidBtcAddress,
  defaultBtcWalletName,
  computeCurrentValueUsd,
} from "@/lib/btc";
import { getBtcBalance, BlockstreamError } from "@/lib/providers/blockstream";
import { getCoinGeckoBatchPrices } from "@/lib/providers/coingecko";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    validateUuid(id, "portfolio ID");
    await requirePortfolioOwnership(id, user.id);

    const body = await parseBody(request, createAsset);

    // Verify sectionId chain: section → sheet → this portfolio
    const rows = await db
      .select({ sectionId: sections.id })
      .from(sections)
      .innerJoin(sheets, eq(sections.sheetId, sheets.id))
      .where(and(eq(sections.id, body.sectionId), eq(sheets.portfolioId, id)))
      .limit(1);

    if (rows.length === 0) {
      return jsonResponse({ error: "Section not found in this portfolio" }, 404);
    }

    // ── Wallet providerType branch ──
    //
    // Validate the address BEFORE any DB insert so bad input returns a 400
    // from our boundary instead of a 500 from upstream. Then fetch the
    // current balance + BTC/USD price so the row has real data on first
    // render — no "loading..." limbo.
    if (body.providerType === "wallet") {
      const config = (body.providerConfig ?? {}) as Record<string, unknown>;
      const chain = config.chain;
      const address = typeof config.address === "string" ? config.address.trim() : "";

      if (chain !== "btc") {
        return errorResponse(
          "Only BTC wallets are supported in this release",
          400
        );
      }
      if (!isValidBtcAddress(address)) {
        return errorResponse(
          "Invalid BTC address. Use a mainnet address starting with bc1, 1, or 3.",
          400
        );
      }

      // Fetch current balance. If both Blockstream and Mempool.space are
      // down, refuse the create — better to error out than insert a
      // zeroed-out row the user has to debug later. The cron job handles
      // the ongoing-sync failure mode separately.
      let info;
      try {
        info = await getBtcBalance(address, { skipCache: true });
      } catch (err) {
        if (err instanceof BlockstreamError) {
          return errorResponse(
            `Could not fetch BTC balance: ${err.message}`,
            502
          );
        }
        throw err;
      }

      // Fetch BTC/USD spot price. Soft-fail: if CoinGecko is down we still
      // insert the asset row with quantity + zero value, so the user
      // doesn't lose their work. The cron tick will backfill the price.
      let btcUsdPrice: number | null = null;
      try {
        const prices = await getCoinGeckoBatchPrices(["bitcoin"], "USD");
        btcUsdPrice = prices.get("bitcoin")?.price ?? null;
      } catch (err) {
        console.warn(
          `[assets:create] CoinGecko fetch failed during wallet create (continuing without price):`,
          err
        );
      }

      const valueUsd = computeCurrentValueUsd(info.balanceSats, btcUsdPrice);
      const name = body.name?.trim() || defaultBtcWalletName(address);

      const [asset] = await db
        .insert(assets)
        .values({
          sectionId: body.sectionId,
          name,
          type: "crypto",
          currency: "USD",
          quantity: info.balanceBtcString,
          currentValue: valueUsd ?? "0",
          currentPrice: btcUsdPrice != null ? btcUsdPrice.toFixed(8) : null,
          isInvestable: body.isInvestable ?? true,
          isCashEquivalent: false,
          providerType: "wallet",
          providerConfig: {
            chain: "btc",
            address,
            source: info.source,
          },
          ownershipPct: body.ownershipPct ?? "100",
          notes: body.notes,
          sortOrder: body.sortOrder ?? 0,
          lastSyncedAt: new Date(),
        })
        .returning();

      return jsonResponse(asset, 201);
    }

    // ── Default (manual / ticker / etc.) branch ──
    const [asset] = await db
      .insert(assets)
      .values({
        sectionId: body.sectionId,
        name: body.name,
        type: body.type ?? "other",
        currency: body.currency ?? "USD",
        quantity: body.quantity,
        costBasis: body.costBasis,
        currentValue: body.currentValue ?? "0",
        currentPrice: body.currentPrice,
        isInvestable: body.isInvestable ?? true,
        isCashEquivalent: body.isCashEquivalent ?? false,
        providerType: body.providerType ?? "manual",
        providerConfig: body.providerConfig ?? {},
        ownershipPct: body.ownershipPct ?? "100",
        notes: body.notes,
        sortOrder: body.sortOrder ?? 0,
      })
      .returning();

    return jsonResponse(asset, 201);
  } catch (error) {
    return handleError(error);
  }
}
