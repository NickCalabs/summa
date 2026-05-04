import { describe, it, expect } from "vitest";
import { suggestAssetMatch, levenshtein } from "@/lib/ai/fuzzy-match";

const candidates = [
  { id: "a1", name: "River Bitcoin", currency: "BTC", type: "crypto" },
  { id: "a2", name: "River Cash", currency: "USD", type: "cash" },
  { id: "a3", name: "Fidelity 401k", currency: "USD", type: "investment" },
  { id: "a4", name: "Chase Checking", currency: "USD", type: "cash" },
];

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("abc", "abc")).toBe(0);
  });

  it("returns string length for empty comparison", () => {
    expect(levenshtein("abc", "")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
  });

  it("returns correct distance for single edits", () => {
    expect(levenshtein("cat", "car")).toBe(1);
    expect(levenshtein("cat", "cats")).toBe(1);
    expect(levenshtein("cat", "at")).toBe(1);
  });

  it("returns correct distance for multiple edits", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });
});

describe("suggestAssetMatch", () => {
  it("returns confidence 1.0 for exact name match (case-insensitive)", () => {
    const result = suggestAssetMatch("River Bitcoin", "BTC", candidates);
    expect(result).not.toBeNull();
    expect(result!.assetId).toBe("a1");
    expect(result!.confidence).toBe(1.0);
  });

  it("matches case-insensitively", () => {
    const result = suggestAssetMatch("river bitcoin", "BTC", candidates);
    expect(result).not.toBeNull();
    expect(result!.assetId).toBe("a1");
    expect(result!.confidence).toBe(1.0);
  });

  it("returns confidence 0.8 for currency match + substring", () => {
    const result = suggestAssetMatch("Bitcoin", "BTC", candidates);
    expect(result).not.toBeNull();
    expect(result!.assetId).toBe("a1");
    expect(result!.confidence).toBe(0.8);
  });

  it("returns confidence 0.8 when extracted name contains asset name", () => {
    const result = suggestAssetMatch("My River Cash Account", "USD", candidates);
    expect(result).not.toBeNull();
    expect(result!.assetId).toBe("a2");
    expect(result!.confidence).toBe(0.8);
  });

  it("returns confidence 0.6 for close Levenshtein match", () => {
    const result = suggestAssetMatch("Chase Checkimg", "USD", candidates);
    expect(result).not.toBeNull();
    expect(result!.assetId).toBe("a4");
    expect(result!.confidence).toBe(0.6);
  });

  it("returns null when no match is close enough", () => {
    const result = suggestAssetMatch("Totally Unknown Account", "JPY", candidates);
    expect(result).toBeNull();
  });

  it("prefers higher confidence matches", () => {
    const result = suggestAssetMatch("River Cash", "USD", candidates);
    expect(result).not.toBeNull();
    expect(result!.assetId).toBe("a2");
    expect(result!.confidence).toBe(1.0);
  });
});
