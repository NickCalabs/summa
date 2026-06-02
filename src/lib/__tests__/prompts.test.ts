import { describe, it, expect } from "vitest";
import { buildExtractionPrompt } from "@/lib/ai/prompts";

describe("buildExtractionPrompt", () => {
  it("returns base prompt without hints", () => {
    const prompt = buildExtractionPrompt();
    expect(prompt).toContain("financial document parser");
    expect(prompt).toContain("JSON array");
    expect(prompt).toContain("confidence");
    expect(prompt).not.toContain("Additional context");
  });

  it("appends hints when provided", () => {
    const prompt = buildExtractionPrompt("This is a River.com statement");
    expect(prompt).toContain("Additional context about this document:");
    expect(prompt).toContain("This is a River.com statement");
  });
});
