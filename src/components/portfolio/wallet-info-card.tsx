"use client";

import { useState } from "react";
import { CopyIcon, CheckIcon, ExternalLinkIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { redactBtcAddress } from "@/lib/btc";
import { copyText } from "@/lib/copy-text";
import { useWalletRefresh } from "@/hooks/use-wallet-refresh";
import type { Asset } from "@/hooks/use-portfolio";

interface WalletInfoCardProps {
  asset: Asset;
  portfolioId: string;
}

const SOURCE_LABELS: Record<string, string> = {
  blockstream: "Blockstream",
  "mempool.space": "Mempool.space",
};

export function WalletInfoCard({ asset, portfolioId }: WalletInfoCardProps) {
  const config = (asset.providerConfig ?? {}) as {
    chain?: string;
    address?: string;
    source?: string;
  };
  const refresh = useWalletRefresh(portfolioId);
  const [copied, setCopied] = useState(false);

  if (config.chain !== "btc" || !config.address) return null;

  const address = config.address;
  const source = config.source ?? "blockstream";
  const sourceLabel = SOURCE_LABELS[source] ?? source;
  const explorerUrl = `https://mempool.space/address/${encodeURIComponent(address)}`;

  async function handleCopy() {
    const ok = await copyText(address);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
            BTC Wallet
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            via {sourceLabel}
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refresh.mutate(asset.id)}
          disabled={refresh.isPending}
        >
          <RefreshCwIcon
            className={`size-3.5 ${refresh.isPending ? "animate-spin" : ""}`}
            data-icon="inline-start"
          />
          {refresh.isPending ? "Syncing..." : "Sync now"}
        </Button>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">Address</p>
        <div className="flex items-center gap-2">
          <code
            className="flex-1 rounded-md border border-border/60 bg-background px-2.5 py-1.5 font-mono text-xs truncate"
            title={address}
          >
            {redactBtcAddress(address)}
          </code>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={handleCopy}
            title="Copy address"
          >
            {copied ? (
              <CheckIcon className="size-3.5" />
            ) : (
              <CopyIcon className="size-3.5" />
            )}
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            title="Open in block explorer"
            render={
              <a href={explorerUrl} target="_blank" rel="noreferrer" />
            }
          >
            <ExternalLinkIcon className="size-3.5" />
          </Button>
        </div>
      </div>

      {asset.lastSyncedAt && (
        <p className="text-xs text-muted-foreground">
          Last synced: {new Date(asset.lastSyncedAt).toLocaleString()}
        </p>
      )}

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Watch-only. Summa never touches private keys.
      </p>
    </div>
  );
}
