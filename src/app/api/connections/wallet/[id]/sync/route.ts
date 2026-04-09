import { db } from "@/lib/db";
import { assets, sections, sheets, portfolios } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  jsonResponse,
  errorResponse,
  handleError,
  requireAuth,
  validateUuid,
} from "@/lib/api-helpers";
import { refreshBtcWallets, refreshEthWallets, refreshSolWallets } from "@/lib/wallets";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    validateUuid(id, "asset ID");

    // Verify asset belongs to this user and is a wallet
    const rows = await db
      .select({ asset: assets })
      .from(assets)
      .innerJoin(sections, eq(assets.sectionId, sections.id))
      .innerJoin(sheets, eq(sections.sheetId, sheets.id))
      .innerJoin(portfolios, eq(sheets.portfolioId, portfolios.id))
      .where(
        and(
          eq(assets.id, id),
          eq(portfolios.userId, user.id),
          eq(assets.providerType, "wallet")
        )
      )
      .limit(1);

    if (rows.length === 0) {
      return errorResponse("Wallet not found", 404);
    }

    const cfg = rows[0].asset.providerConfig as { chain?: string } | null;
    const chain = cfg?.chain;

    let result;
    switch (chain) {
      case "btc":
        result = await refreshBtcWallets({ assetId: id });
        break;
      case "eth":
        result = await refreshEthWallets({ assetId: id });
        break;
      case "sol":
        result = await refreshSolWallets({ assetId: id });
        break;
      default:
        return errorResponse(`Unsupported chain: ${chain}`, 400);
    }

    return jsonResponse(result);
  } catch (error) {
    return handleError(error);
  }
}
