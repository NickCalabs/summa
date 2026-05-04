// Detect suspicious changes in import diffs so the confirmation step can flag
// them before the user clicks Apply. Severity is advisory — the user can
// always proceed; we just want them to look twice.

export type Severity = "ok" | "warning" | "danger";

export interface SeverityResult {
  severity: Severity;
  warnings: string[];
}

export function computeSeverity(params: {
  currentNum: number;
  newNum: number;
  assetCurrency: string;
  extractedCurrency: string;
}): SeverityResult {
  const { currentNum, newNum, assetCurrency, extractedCurrency } = params;
  const warnings: string[] = [];
  let severity: Severity = "ok";

  // Currency mismatch — could mean wrong asset selected
  if (
    assetCurrency &&
    extractedCurrency &&
    assetCurrency.toUpperCase() !== extractedCurrency.toUpperCase()
  ) {
    warnings.push(
      `Currency mismatch (asset is ${assetCurrency}, extracted ${extractedCurrency})`
    );
    severity = "danger";
  }

  // Sign flip (positive value becoming negative or vice versa)
  if (
    currentNum !== 0 &&
    newNum !== 0 &&
    Math.sign(currentNum) !== Math.sign(newNum)
  ) {
    warnings.push("Value sign flipped");
    severity = "danger";
  }

  // Going to zero (account emptied) — common legit case (transfer out, cold
  // storage move) so warning, not danger
  if (currentNum !== 0 && newNum === 0) {
    warnings.push("Account emptied to zero");
    if (severity === "ok") severity = "warning";
  }
  // Coming from zero (account funded for the first time, or restored after
  // being emptied) — also legit but worth a glance
  else if (currentNum === 0 && newNum !== 0) {
    warnings.push("Account funded from zero");
    if (severity === "ok") severity = "warning";
  }
  // Both non-zero: check magnitude
  else if (currentNum !== 0 && newNum !== 0) {
    const ratio = Math.abs(newNum) / Math.abs(currentNum);
    // 1000x+ is almost certainly a decimal/parse error (not a 1000x real-world
    // change). 100x is the threshold where someone *could* receive a wire,
    // get paid, etc. — flag it but as warning.
    if (ratio >= 1000 || ratio <= 0.001) {
      const factor =
        ratio >= 1
          ? `${ratio.toExponential(1)}x larger`
          : `${(1 / ratio).toExponential(1)}x smaller`;
      warnings.push(`Extreme change (${factor}) — likely decimal error`);
      severity = "danger";
    } else if (ratio >= 5 || ratio <= 0.2) {
      const factor =
        ratio >= 1
          ? `${ratio.toFixed(1)}x larger`
          : `${(1 / ratio).toFixed(1)}x smaller`;
      warnings.push(`Significant change (${factor})`);
      if (severity === "ok") severity = "warning";
    } else {
      const pct = ((newNum - currentNum) / Math.abs(currentNum)) * 100;
      if (Math.abs(pct) > 50) {
        warnings.push(
          `${pct > 0 ? "+" : ""}${pct.toFixed(0)}% change`
        );
        if (severity === "ok") severity = "warning";
      }
    }
  }

  return { severity, warnings };
}
