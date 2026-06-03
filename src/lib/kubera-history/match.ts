import { suggestAssetMatch } from "@/lib/ai/fuzzy-match";

interface Candidate { id: string; name: string; currency: string; type: string }
export interface MatchOutcome {
  matched: { assetName: string; assetId: string }[];
  ambiguous: string[];   // names with >1 equally-good candidate and no override
  unmatched: string[];   // names with no candidate and no override
}

export function matchFiles(
  assetNames: string[],
  candidates: Candidate[],
  overrides: Record<string, string>
): MatchOutcome {
  const out: MatchOutcome = { matched: [], ambiguous: [], unmatched: [] };
  for (const name of assetNames) {
    if (overrides[name]) {
      out.matched.push({ assetName: name, assetId: overrides[name] });
      continue;
    }
    const best = suggestAssetMatch(name, "USD", candidates);
    if (!best) { out.unmatched.push(name); continue; }
    // Ambiguous if another candidate ties the best confidence.
    const ties = candidates.filter((c) => {
      const m = suggestAssetMatch(name, "USD", [c]);
      return m != null && Math.abs(m.confidence - best.confidence) < 1e-9;
    });
    if (ties.length > 1) { out.ambiguous.push(name); continue; }
    out.matched.push({ assetName: name, assetId: best.assetId });
  }
  return out;
}
