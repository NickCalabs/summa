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
import {
  isValidEthAddress,
  normalizeEthAddress,
  defaultEthWalletName,
  truncateEthQuantity,
  weiToEthString,
  isStablecoinContract,
} from "@/lib/eth";
import {
  isValidSolAddress,
  normalizeSolAddress,
  defaultSolWalletName,
  truncateSolQuantity,
  lamportsToSolString,
  isStablecoinMint,
} from "@/lib/sol";
import { getBtcBalance, BlockstreamError } from "@/lib/providers/blockstream";
import { getEthBalance, EtherscanError, isEtherscanConfigured } from "@/lib/providers/etherscan";
import { getSolBalance, HeliusError, isHeliusConfigured } from "@/lib/providers/helius";
import { getCoinGeckoBatchPrices, getCoinGeckoTokenPrice } from "@/lib/providers/coingecko";

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

      if (chain !== "btc" && chain !== "eth" && chain !== "sol") {
        return errorResponse(
          "Unsupported wallet chain. Supported: btc, eth, sol",
          400
        );
      }

      // ── ETH wallet ──
      if (chain === "eth") {
        if (!isValidEthAddress(address)) {
          return errorResponse(
            "Invalid ETH address. Use a 0x-prefixed 40-character hex address.",
            400
          );
        }
        if (!isEtherscanConfigured()) {
          return errorResponse(
            "Etherscan API key is not configured. Set ETHERSCAN_API_KEY in your .env file.",
            503
          );
        }
        const normalized = normalizeEthAddress(address);

        let info;
        try {
          info = await getEthBalance(normalized, { skipCache: true });
        } catch (err) {
          if (err instanceof EtherscanError) {
            return errorResponse(
              `Could not fetch ETH balance: ${err.message}`,
              502
            );
          }
          throw err;
        }

        // ETH/USD price
        let ethUsdPrice: number | null = null;
        try {
          const prices = await getCoinGeckoBatchPrices(["ethereum"], "USD");
          ethUsdPrice = prices.get("ethereum")?.price ?? null;
        } catch {
          // Soft-fail: insert the asset without USD value; cron will fill it in.
        }

        // Price each token via CoinGecko contract lookup
        const tokenList = await Promise.all(
          info.tokens.map(async (t) => {
            let priceUsd = 0;
            try {
              priceUsd = (await getCoinGeckoTokenPrice(t.contractAddress)) ?? 0;
            } catch {
              // CoinGecko didn't have this token — leave price at 0.
            }
            const balance = Number(t.formattedBalance);
            return {
              symbol: t.symbol,
              name: t.name,
              contractAddress: t.contractAddress,
              decimals: t.decimals,
              balance: t.formattedBalance,
              priceUsd,
              valueUsd: balance * priceUsd,
              isStablecoin: isStablecoinContract(t.contractAddress),
            };
          })
        );

        // Sort by USD value desc, keep top 50
        tokenList.sort((a, b) => b.valueUsd - a.valueUsd);
        const topTokens = tokenList.slice(0, 50);

        const ethValueUsd = ethUsdPrice != null ? info.ethBalanceFormatted * ethUsdPrice : 0;
        const tokenValueUsd = topTokens.reduce((sum, t) => sum + t.valueUsd, 0);
        const totalUsd = ethValueUsd + tokenValueUsd;

        const ethQty = truncateEthQuantity(weiToEthString(info.ethBalanceWei));
        const walletName = body.name?.trim() || defaultEthWalletName(normalized);

        const [asset] = await db
          .insert(assets)
          .values({
            sectionId: body.sectionId,
            name: walletName,
            type: "crypto",
            currency: "USD",
            quantity: ethQty,
            currentValue: totalUsd.toFixed(2),
            currentPrice: ethUsdPrice != null ? ethUsdPrice.toFixed(8) : null,
            isInvestable: body.isInvestable ?? true,
            isCashEquivalent: false,
            providerType: "wallet",
            providerConfig: {
              chain: "eth",
              address: normalized,
              source: "etherscan",
            },
            metadata: {
              ethBalance: ethQty,
              ethPriceUsd: ethUsdPrice,
              tokens: topTokens,
              totalUsd,
              lastSync: new Date().toISOString(),
            },
            ownershipPct: body.ownershipPct ?? "100",
            notes: body.notes,
            sortOrder: body.sortOrder ?? 0,
            lastSyncedAt: new Date(),
          })
          .returning();

        return jsonResponse(asset, 201);
      }

      // ── SOL wallet ──
      if (chain === "sol") {
        if (!isValidSolAddress(address)) {
          return errorResponse(
            "Invalid SOL address. Use a base58-encoded Solana public key (32-44 characters).",
            400
          );
        }
        if (!isHeliusConfigured()) {
          return errorResponse(
            "Helius API key is not configured. Set HELIUS_API_KEY in your .env file.",
            503
          );
        }
        const normalized = normalizeSolAddress(address);

        let info;
        try {
          info = await getSolBalance(normalized, { skipCache: true });
        } catch (err) {
          if (err instanceof HeliusError) {
            return errorResponse(
              `Could not fetch SOL balance: ${err.message}`,
              502
            );
          }
          throw err;
        }

        // Helius DAS pre-prices SOL and most tokens. Use their price if
        // available, otherwise fall back to CoinGecko for the SOL/USD rate.
        let solUsdPrice = info.solPriceUsd;
        if (solUsdPrice == null) {
          try {
            const prices = await getCoinGeckoBatchPrices(["solana"], "USD");
            solUsdPrice = prices.get("solana")?.price ?? null;
          } catch {
            // Soft-fail
          }
        }

        // Build token list with stablecoin detection
        const tokenList = info.tokens.map((t) => ({
          symbol: t.symbol,
          name: t.name,
          mint: t.mint,
          decimals: t.decimals,
          balance: t.formattedBalance,
          priceUsd: t.priceUsd,
          valueUsd: t.valueUsd,
          isStablecoin: isStablecoinMint(t.mint),
        }));

        const solValueUsd =
          solUsdPrice != null ? info.solBalanceFormatted * solUsdPrice : info.solValueUsd;
        const tokenValueUsd = tokenList.reduce((sum, t) => sum + t.valueUsd, 0);
        const totalUsd = solValueUsd + tokenValueUsd;

        const solQty = truncateSolQuantity(lamportsToSolString(info.solBalanceLamports));
        const walletName = body.name?.trim() || defaultSolWalletName(normalized);

        const [asset] = await db
          .insert(assets)
          .values({
            sectionId: body.sectionId,
            name: walletName,
            type: "crypto",
            currency: "USD",
            quantity: solQty,
            currentValue: totalUsd.toFixed(2),
            currentPrice: solUsdPrice != null ? solUsdPrice.toFixed(8) : null,
            isInvestable: body.isInvestable ?? true,
            isCashEquivalent: false,
            providerType: "wallet",
            providerConfig: {
              chain: "sol",
              address: normalized,
              source: "helius",
            },
            metadata: {
              solBalance: solQty,
              solPriceUsd: solUsdPrice,
              tokens: tokenList,
              totalUsd,
              lastSync: new Date().toISOString(),
            },
            ownershipPct: body.ownershipPct ?? "100",
            notes: body.notes,
            sortOrder: body.sortOrder ?? 0,
            lastSyncedAt: new Date(),
          })
          .returning();

        return jsonResponse(asset, 201);
      }

      // ── BTC wallet ──
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
