import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sections, sheets } from "@/lib/db/schema";
import type { TargetSheetType } from "./provider-account-grouping";

function normalizeSectionName(value: string): string {
  return value.trim().toLowerCase();
}

export async function ensurePortfolioInstitutionSection(input: {
  portfolioId: string;
  sheetType: TargetSheetType;
  institutionName: string;
}) {
  const matchingSheets = await db
    .select()
    .from(sheets)
    .where(
      and(
        eq(sheets.portfolioId, input.portfolioId),
        eq(sheets.type, input.sheetType)
      )
    )
    .orderBy(asc(sheets.sortOrder));

  let targetSheet = matchingSheets[0];

  if (!targetSheet) {
    const allSheets = await db
      .select()
      .from(sheets)
      .where(eq(sheets.portfolioId, input.portfolioId))
      .orderBy(asc(sheets.sortOrder));

    [targetSheet] = await db
      .insert(sheets)
      .values({
        portfolioId: input.portfolioId,
        name: input.sheetType === "debts" ? "Debts" : "Assets",
        type: input.sheetType,
        sortOrder: allSheets.length,
      })
      .returning();
  }

  const sheetSections = await db
    .select()
    .from(sections)
    .where(eq(sections.sheetId, targetSheet.id))
    .orderBy(asc(sections.sortOrder));

  const existingSection = sheetSections.find(
    (section) =>
      normalizeSectionName(section.name) ===
      normalizeSectionName(input.institutionName)
  );

  if (existingSection) {
    return existingSection;
  }

  const [createdSection] = await db
    .insert(sections)
    .values({
      sheetId: targetSheet.id,
      name: input.institutionName,
      sortOrder: sheetSections.length,
    })
    .returning();

  return createdSection;
}
