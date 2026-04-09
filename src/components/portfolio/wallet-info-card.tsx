"use client";

import { useState } from "react";
import { CopyIcon, CheckIcon, ExternalLinkIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { redactBtcAddress } from "@/lib/btc";
import { redactEthAddress } from "@/lib/eth";
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
  etherscan: "Etherscan",
};

interface TokenInfo {
  symbol: string;
  name?: string;
  balance: string;
  priceUsd: number;
  valueUsd: number;
  isStablecoin: boolean;
}

export function WalletInfoCard({ asset, portfolioId }: WalletInfoCardProps) {
  const config = (asset.providerConfig ?? {}) as {
    chain?: string;
    address?: string;
    source?: string;
  };
  const refresh = useWalletRefresh(portfolioId);
  const [copied, setCopied] = useState(false);

  const chain = config.chain;
  if ((chain !== "btc" && chain !== "eth") || !config.address) return null;

  const address = config.address;
  const source = config.source ?? (chain === "eth" ? "etherscan" : "blockstream");
  const sourceLabel = SOURCE_LABELS[source] ?? source;

  const explorerUrl =
    chain === "eth"
      ? `https://etherscan.io/address/${encodeURIComponent(address)}`
      : `https://mempool.space/address/${encodeURIComponent(address)}`;

  const redacted =
    chain === "eth" ? redactEthAddress(address) : redactBtcAddress(address);

  const chainLabel = chain === "eth" ? "ETH Wallet" : "BTC Wallet";

  // Token list from metadata (ETH wallets only, Option A flat structure)
  const metadata = (asset.metadata ?? {}) as {
    tokens?: TokenInfo[];
    ethBalance?: string;
    ethPriceUsd?: number;
  };
  const tokens = chain === "eth" ? (metadata.tokens ?? []) : [];

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
            {chainLabel}
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
            {redacted}
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

      {/* ETH balance line (ETH wallets only) */}
      {chain === "eth" && metadata.ethBalance && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">ETH Balance</p>
          <p className="text-sm font-medium tabular-nums">
            {Number(metadata.ethBalance).toLocaleString(undefined, {
              minimumFractionDigits: 4,
              maximumFractionDigits: 8,
            })}{" "}
            ETH
            {metadata.ethPriceUsd != null && (
              <span className="text-xs text-muted-foreground ml-2">
                @ ${metadata.ethPriceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            )}
          </p>
        </div>
      )}

      {/* Token breakdown list (ETH wallets only) */}
      {tokens.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Tokens ({tokens.length})
          </p>
          <div className="divide-y divide-border/40 rounded-lg border border-border/40 overflow-hidden">
            {tokens.map((token) => (
              <div
                key={token.symbol}
                className="flex items-center justify-between px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium truncate">{token.symbol}</span>
                  {token.isStablecoin && (
                    <Badge variant="outline" className="text-[9px] shrink-0">
                      Stablecoin
                    </Badge>
                  )}
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="tabular-nums">
                    ${token.valueUsd.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {Number(token.balance).toLocaleString(undefined, {
                      maximumFractionDigits: 4,
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
