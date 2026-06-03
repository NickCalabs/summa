import { describe, it, expect } from "vitest";
import { matchFiles } from "@/lib/kubera-history/match";

const candidates = [
  { id: "a1", name: "Riv", currency: "USD", type: "cash" },
  { id: "a2", name: "Riv", currency: "USD", type: "crypto" },
  { id: "a3", name: "Schwab", currency: "USD", type: "investment" },
];

describe("matchFiles", () => {
  it("auto-matches an unambiguous name", () => {
    const r = matchFiles(["Schwab"], candidates, {});
    expect(r.matched).toEqual([{ assetName: "Schwab", assetId: "a3" }]);
    expect(r.ambiguous).toEqual([]);
    expect(r.unmatched).toEqual([]);
  });

  it("flags ambiguous names (two 'Riv') unless an override resolves them", () => {
    const r = matchFiles(["Riv (BTC)"], candidates, {});
    expect(r.ambiguous).toContain("Riv (BTC)");
    const r2 = matchFiles(["Riv (BTC)"], candidates, { "Riv (BTC)": "a2" });
    expect(r2.matched).toEqual([{ assetName: "Riv (BTC)", assetId: "a2" }]);
  });

  it("reports a name that matches nothing as unmatched", () => {
    expect(matchFiles(["Nonexistent XYZ"], candidates, {}).unmatched).toContain("Nonexistent XYZ");
  });
});
