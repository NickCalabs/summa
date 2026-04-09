"use client";

import type { ParsedAccount, ImportAction } from "@/lib/kubera-parser";

interface ExistingAsset {
  id: string;
  name: string;
  providerType: string;
}

interface KuberaAccountRowProps {
  account: ParsedAccount;
  existingAssets: ExistingAsset[];
  onActionChange: (kuberaId: string, action: ImportAction, matchedAssetId?: string) => void;
}

function formatValue(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export function KuberaAccountRow({
  account,
  existingAssets,
  onActionChange,
}: KuberaAccountRowProps) {
  const matchedAsset = existingAssets.find((a) => a.id === account.matchedAssetId);

  return (
    <div className="flex items-center justify-between gap-4 py-2 px-3 rounded-md hover:bg-muted/50">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{account.name}</span>
          {account.ticker && (
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {account.ticker}
            </span>
          )}
        </div>
        <div className="text-sm text-muted-foreground">
          {formatValue(account.value, account.currency)}
          {account.quantity != null && account.ticker && (
            <span className="ml-2">
              {account.quantity} {account.ticker}
            </span>
          )}
        </div>
        {account.action === "match" && matchedAsset && (
          <div className="text-xs text-green-600 mt-0.5">
            Matched: &quot;{matchedAsset.name}&quot;
            {matchedAsset.providerType !== "manual" && (
              <span className="ml-1">({matchedAsset.providerType})</span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={account.action === "match" ? `match::${account.matchedAssetId}` : account.action}
          onChange={(e) => {
            const val = e.target.value;
            if (val === "create") {
              onActionChange(account.kuberaId, "create");
            } else if (val === "skip") {
              onActionChange(account.kuberaId, "skip");
            } else if (val.startsWith("match::")) {
              const assetId = val.replace("match::", "");
              onActionChange(account.kuberaId, "match", assetId);
            }
          }}
        >
          <option value="create">Create new</option>
          <option value="skip">Skip</option>
          {existingAssets.map((a) => (
            <option key={a.id} value={`match::${a.id}`}>
              Match: {a.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
