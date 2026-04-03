import { db } from "@/lib/db";
import { assets, sections, sheets } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  jsonResponse,
  errorResponse,
  handleError,
  requireAuth,
  requirePortfolioOwnership,
  validateUuid,
} from "@/lib/api-helpers";
import { parseBody, csvImportConfirm } from "@/types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await params;
    validateUuid(id, "portfolio ID");
    await requirePortfolioOwnership(id, user.id);

    const body = await parseBody(request, csvImportConfirm);

    const MAX_ROWS = 10000;
    if (body.rows.length > MAX_ROWS) {
      return errorResponse(`Too many rows. Maximum is ${MAX_ROWS} rows per import.`, 413);
    }

    // Verify section belongs to this portfolio
    const [section] = await db
      .select({ id: sections.id })
      .from(sections)
      .innerJoin(sheets, eq(sections.sheetId, sheets.id))
      .where(
        and(eq(sections.id, body.sectionId), eq(sheets.portfolioId, id))
      )
      .limit(1);

    if (!section) {
      return errorResponse("Section not found in this portfolio", 404);
    }

    const mapping = body.columnMapping;
    const defaultCurrency = body.defaultCurrency ?? "USD";

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < body.rows.length; i++) {
      const row = body.rows[i];
      try {
        // Map columns
        const mapped: Record<string, string> = {};
        for (const [csvCol, assetField] of Object.entries(mapping)) {
          if (row[csvCol] !== undefined && row[csvCol] !== "") {
            mapped[assetField] = row[csvCol].trim();
          }
        }

        // Name is required
        if (!mapped.name) {
          skipped++;
          continue;
        }

        const currentValue = mapped.currentValue
          ? parseFloat(mapped.currentValue.replace(/[,$]/g, ""))
          : 0;

        if (isNaN(currentValue)) {
          errors.push(`Row ${i + 1}: Invalid value "${mapped.currentValue}"`);
          skipped++;
          continue;
        }

        const quantity = mapped.quantity
          ? parseFloat(mapped.quantity.replace(/[,$]/g, ""))
          : null;
        const currentPrice = mapped.currentPrice
          ? parseFloat(mapped.currentPrice.replace(/[,$]/g, ""))
          : null;
        const costBasis = mapped.costBasis
          ? parseFloat(mapped.costBasis.replace(/[,$]/g, ""))
          : null;

        await db.insert(assets).values({
          sectionId: body.sectionId,
          name: mapped.name,
          type: mapped.type || "other",
          currency: mapped.currency || defaultCurrency,
          currentValue: Math.abs(currentValue).toFixed(2),
          quantity: quantity != null && !isNaN(quantity) ? quantity.toFixed(8) : null,
          currentPrice:
            currentPrice != null && !isNaN(currentPrice)
              ? currentPrice.toFixed(8)
              : null,
          costBasis:
            costBasis != null && !isNaN(costBasis) ? costBasis.toFixed(2) : null,
          notes: mapped.notes || null,
          providerType: "manual",
          sortOrder: imported,
        });

        imported++;
      } catch (err) {
        errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : "Unknown error"}`);
        skipped++;
      }
    }

    return jsonResponse({ imported, skipped, errors });
  } catch (error) {
    return handleError(error);
  }
}
