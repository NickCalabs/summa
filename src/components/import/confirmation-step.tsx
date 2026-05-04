"use client";

import { Button } from "@/components/ui/button";
import { Loader2Icon } from "lucide-react";

interface ChangeRow {
  assetId: string;
  assetName: string;
  field: "currentValue" | "quantity";
  currentDisplay: string;
  newDisplay: string;
  delta: string;
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
  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">
        Review {rows.length} change{rows.length === 1 ? "" : "s"}:
      </p>

      <div className="rounded border overflow-x-auto">
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
            {rows.map((row) => (
              <tr key={row.assetId} className="border-b last:border-b-0">
                <td className="py-2 px-3">
                  <div className="font-medium">{row.assetName}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.field === "quantity" ? "Quantity" : "Value"}
                  </div>
                </td>
                <td className="py-2 px-3 text-right tabular-nums">{row.currentDisplay}</td>
                <td className="py-2 px-3 text-right tabular-nums">{row.newDisplay}</td>
                <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                  {row.delta}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {asOfDate && (
        <p className="text-xs text-muted-foreground">Statement date: {asOfDate}</p>
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
