import { db } from "@/lib/db";
import {
  aiSettings,
  importSources,
  assets,
  sections,
  sheets,
  portfolios,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  requireAuth,
  jsonResponse,
  errorResponse,
  handleError,
} from "@/lib/api-helpers";
import { getAIProvider } from "@/lib/ai";
import { extractTextFromPdf } from "@/lib/ai/pdf-text";
import { suggestAssetMatch } from "@/lib/ai/fuzzy-match";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const { user } = await requireAuth(request);

    const formData = await request.formData();
    const file = formData.get("file");
    const sourceId = formData.get("sourceId") as string | null;
    const portfolioId = formData.get("portfolioId") as string | null;

    if (!file || !(file instanceof File)) {
      return errorResponse("No file provided", 400);
    }
    if (file.size > MAX_FILE_SIZE) {
      return errorResponse("File too large. Maximum size is 10MB.", 413);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let text: string;

    const fileName = file.name.toLowerCase();
    if (file.type === "application/pdf" || fileName.endsWith(".pdf")) {
      text = await extractTextFromPdf(buffer);
    } else if (
      file.type === "text/csv" ||
      fileName.endsWith(".csv") ||
      file.type.startsWith("text/")
    ) {
      text = buffer.toString("utf-8");
    } else {
      return errorResponse("Unsupported file type. Use PDF or CSV.", 400);
    }

    if (!text.trim()) {
      return errorResponse(
        "Could not extract text from file. The document may be image-only.",
        422
      );
    }

    const [settings] = await db
      .select()
      .from(aiSettings)
      .where(eq(aiSettings.userId, user.id))
      .limit(1);

    let matchedSource = null;
    if (sourceId) {
      const [source] = await db
        .select()
        .from(importSources)
        .where(
          and(
            eq(importSources.id, sourceId),
            eq(importSources.userId, user.id)
          )
        )
        .limit(1);
      matchedSource = source || null;
    }

    const provider = getAIProvider(settings || undefined);
    const extracted = await provider.extractBalances(
      text,
      matchedSource?.extractionHints || undefined
    );

    const userAssets = await db
      .select({
        id: assets.id,
        name: assets.name,
        currency: assets.currency,
        type: assets.type,
      })
      .from(assets)
      .innerJoin(sections, eq(assets.sectionId, sections.id))
      .innerJoin(sheets, eq(sections.sheetId, sheets.id))
      .innerJoin(portfolios, eq(sheets.portfolioId, portfolios.id))
      .where(
        and(
          eq(portfolios.userId, user.id),
          eq(assets.isArchived, false),
          portfolioId ? eq(portfolios.id, portfolioId) : undefined
        )
      );

    const suggestedMappings = extracted.map((item) => {
      if (matchedSource) {
        const saved = matchedSource.fieldMappings.find(
          (m) =>
            m.extractedKey.toLowerCase() === item.account.toLowerCase()
        );
        if (saved) {
          const asset = userAssets.find((a) => a.id === saved.assetId);
          return {
            extractedKey: item.account,
            suggestedAssetId: saved.assetId,
            suggestedAssetName: asset?.name || null,
            confidence: 1.0,
            field: saved.field,
          };
        }
      }

      const match = suggestAssetMatch(
        item.account,
        item.currency,
        userAssets
      );
      return {
        extractedKey: item.account,
        suggestedAssetId: match?.assetId || null,
        suggestedAssetName: match?.assetName || null,
        confidence: match?.confidence || 0,
        field: null as "currentValue" | "quantity" | null,
      };
    });

    return jsonResponse({ extracted, matchedSource, suggestedMappings });
  } catch (error) {
    return handleError(error);
  }
}
