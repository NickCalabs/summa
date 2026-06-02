"use client";

import { Button } from "@/components/ui/button";
import { Loader2Icon, AlertTriangleIcon, AlertCircleIcon } from "lucide-react";
import type { Severity } from "@/lib/ai/anomaly";

interface ChangeRow {
  assetId: string;
  assetName: string;
  field: "currentValue" | "quantity";
  currentDisplay: string;
  newDisplay: string;
  delta: string;
  severity: Severity;
  warnings: string[];
}

interface Props {
  rows: ChangeRow[];
  asOfDate?: string;
  isApplying: boolean;
  onBack: () => void;
  onApply: () => void;
}

export function ConfirmationStep({
  rows,
  asOfDate,
  isApplying,
  onBack,
  onApply,
}: Props) {
  const dangerCount = rows.filter((r) => r.severity === "danger").length;
  const warningCount = rows.filter((r) => r.severity === "warning").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          Review {rows.length} change{rows.length === 1 ? "" : "s"}:
        </p>
        {(dangerCount > 0 || warningCount > 0) && (
          <p className="text-xs text-muted-foreground">
            {dangerCount > 0 && (
              <span className="text-destructive">
                {dangerCount} flagged
              </span>
            )}
            {dangerCount > 0 && warningCount > 0 && " · "}
            {warningCount > 0 && (
              <span className="text-amber-600 dark:text-amber-500">
                {warningCount} unusual
              </span>
            )}
          </p>
        )}
      </div>

      <div className="rounded border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
              <th className="py-2 px-3 font-medium">Asset</th>
              <th className="py-2 px-3 font-medium text-right">Current</th>
              <th className="py-2 px-3 font-medium text-right">New</th>
              <th className="py-2 px-3 font-medium text-right">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const borderClass =
                row.severity === "danger"
                  ? "border-l-2 border-l-destructive"
                  : row.severity === "warning"
                  ? "border-l-2 border-l-amber-500"
                  : "";
              return (
                <tr
                  key={row.assetId}
                  className={`border-b last:border-b-0 ${borderClass}`}
                >
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-1.5">
                      {row.severity === "danger" && (
                        <AlertCircleIcon
                          className="size-3.5 text-destructive shrink-0"
                          aria-label="Suspicious change"
                        />
                      )}
                      {row.severity === "warning" && (
                        <AlertTriangleIcon
                          className="size-3.5 text-amber-500 shrink-0"
                          aria-label="Unusual change"
                        />
                      )}
                      <span className="font-medium">{row.assetName}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {row.field === "quantity" ? "Quantity" : "Value"}
                    </div>
                    {row.warnings.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {row.warnings.map((w, i) => (
                          <li
                            key={i}
                            className={`text-xs ${
                              row.severity === "danger"
                                ? "text-destructive"
                                : "text-amber-600 dark:text-amber-500"
                            }`}
                          >
                            • {w}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums align-top">
                    {row.currentDisplay}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums align-top">
                    {row.newDisplay}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-muted-foreground align-top">
                    {row.delta}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {asOfDate && (
        <p className="text-xs text-muted-foreground">Statement date: {asOfDate}</p>
      )}

      {dangerCount > 0 && (
        <p className="text-xs text-muted-foreground">
          Flagged rows have unusual changes. Review them carefully — you can still
          apply if they&apos;re correct, or go back and skip/remap them.
        </p>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={isApplying}>
          ← Edit mappings
        </Button>
        <Button onClick={onApply} disabled={isApplying}>
          {isApplying ? (
            <>
              <Loader2Icon className="size-4 animate-spin mr-2" />
              Applying...
            </>
          ) : (
            "Apply now"
          )}
        </Button>
      </div>
    </div>
  );
}
