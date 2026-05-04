interface AssetCandidate {
  id: string;
  name: string;
  currency: string;
  type: string;
}

interface MatchResult {
  assetId: string;
  assetName: string;
  confidence: number;
}

export function suggestAssetMatch(
  extractedAccount: string,
  extractedCurrency: string,
  candidates: AssetCandidate[]
): MatchResult | null {
  const normalizedExtracted = extractedAccount.toLowerCase().trim();

  let bestMatch: MatchResult | null = null;
  let bestConfidence = 0;

  for (const candidate of candidates) {
    const normalizedName = candidate.name.toLowerCase().trim();
    let confidence = 0;

    if (normalizedName === normalizedExtracted) {
      confidence = 1.0;
    } else if (
      candidate.currency.toUpperCase() === extractedCurrency.toUpperCase() &&
      (normalizedName.includes(normalizedExtracted) ||
        normalizedExtracted.includes(normalizedName))
    ) {
      confidence = 0.8;
    } else {
      const dist = levenshtein(normalizedName, normalizedExtracted);
      if (dist <= 3) {
        confidence = 0.6;
      }
    }

    if (confidence > bestConfidence) {
      bestConfidence = confidence;
      bestMatch = {
        assetId: candidate.id,
        assetName: candidate.name,
        confidence,
      };
    }
  }

  return bestMatch;
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}
