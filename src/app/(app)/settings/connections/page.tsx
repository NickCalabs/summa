"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  RefreshCwIcon,
  MoreHorizontalIcon,
  ChevronDownIcon,
  WalletIcon,
  LandmarkIcon,
  BanknoteIcon,
  BitcoinIcon,
  ActivityIcon,
  Loader2Icon,
  TrashIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useConnections,
  useSyncAll,
  useSyncWallet,
  useSyncPlaid,
  useSyncSimpleFIN,
  useSyncCoinbase,
  type ConnectionStatus,
  type WalletConnection,
  type PlaidConnectionSummary,
  type SimpleFINConnectionSummary,
  type CoinbaseConnectionSummary,
  type PriceFeedStatus,
} from "@/hooks/use-connections";
import {
  useCreateCoinbaseConnection,
  useDisconnectCoinbase,
} from "@/hooks/use-coinbase";

// ── Status dot ──

function StatusDot({ status }: { status: ConnectionStatus }) {
  const colors: Record<ConnectionStatus, string> = {
    ok: "bg-emerald-500",
    stale: "bg-amber-500",
    error: "bg-red-500",
    never: "bg-red-500",
    unconfigured: "bg-zinc-400",
  };
  return (
    <span
      className={`inline-block size-2.5 rounded-full shrink-0 ${colors[status] ?? colors.never}`}
      title={status}
    />
  );
}

// ── Time display ──

function TimeAgo({ date }: { date: string | null }) {
  if (!date) return <span className="text-muted-foreground">Never synced</span>;
  return (
    <span className="text-muted-foreground">
      {formatDistanceToNow(new Date(date), { addSuffix: true })}
    </span>
  );
}

// ── Truncated address ──

function truncateAddress(address: string) {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function chainLabel(chain: string) {
  const labels: Record<string, string> = {
    btc: "BTC",
    eth: "ETH",
    sol: "SOL",
  };
  return labels[chain] ?? chain.toUpperCase();
}

// ── Collapsible section ──

function ConnectionSection({
  title,
  icon: Icon,
  count,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ElementType;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronDownIcon
          className={`size-4 transition-transform ${open ? "" : "-rotate-90"}`}
        />
        <Icon className="size-4" />
        <span>{title}</span>
        <span className="text-xs text-muted-foreground/60 ml-1">
          ({count})
        </span>
      </button>
      {open && <div className="space-y-1 pl-6">{children}</div>}
    </div>
  );
}

// ── Wallet row ──

function WalletRow({
  wallet,
  syncing,
  onSync,
}: {
  wallet: WalletConnection;
  syncing: boolean;
  onSync: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm">
      <StatusDot status={wallet.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{wallet.name}</span>
          <span className="text-xs text-muted-foreground font-mono">
            {chainLabel(wallet.chain)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground font-mono">
            {truncateAddress(wallet.address)}
          </span>
          <span className="text-muted-foreground">·</span>
          <TimeAgo date={wallet.lastSyncedAt} />
        </div>
        {wallet.error && (
          <p className="text-xs text-destructive mt-0.5">{wallet.error}</p>
        )}
      </div>
      <span className="text-sm tabular-nums font-medium whitespace-nowrap">
        ${Number(wallet.currentValue).toLocaleString(undefined, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        disabled={syncing}
        onClick={onSync}
      >
        {syncing ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : (
          <RefreshCwIcon className="size-3.5" />
        )}
      </Button>
    </div>
  );
}

// ── Plaid row ──

function PlaidRow({
  connection,
  syncing,
  onSync,
}: {
  connection: PlaidConnectionSummary;
  syncing: boolean;
  onSync: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm">
      <StatusDot status={connection.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">
            {connection.institutionName}
          </span>
          <span className="text-xs text-muted-foreground">
            {connection.accountCount} account{connection.accountCount !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="text-xs">
          <TimeAgo date={connection.lastSyncedAt} />
        </div>
        {connection.errorMessage && (
          <p className="text-xs text-destructive mt-0.5">
            {connection.errorCode}: {connection.errorMessage}
          </p>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        disabled={syncing}
        onClick={onSync}
      >
        {syncing ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : (
          <RefreshCwIcon className="size-3.5" />
        )}
      </Button>
    </div>
  );
}

// ── SimpleFIN row ──

function SimpleFINRow({
  connection,
  syncing,
  onSync,
}: {
  connection: SimpleFINConnectionSummary;
  syncing: boolean;
  onSync: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm">
      <StatusDot status={connection.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{connection.label}</span>
          <span className="text-xs text-muted-foreground">
            {connection.accountCount} account{connection.accountCount !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="text-xs">
          <TimeAgo date={connection.lastSyncedAt} />
        </div>
        {connection.errorMessage && (
          <p className="text-xs text-destructive mt-0.5">
            {connection.errorCode}: {connection.errorMessage}
          </p>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        disabled={syncing}
        onClick={onSync}
      >
        {syncing ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : (
          <RefreshCwIcon className="size-3.5" />
        )}
      </Button>
    </div>
  );
}

// ── Coinbase row ──

function CoinbaseRow({
  connection,
  syncing,
  disconnecting,
  onSync,
  onDisconnect,
}: {
  connection: CoinbaseConnectionSummary;
  syncing: boolean;
  disconnecting: boolean;
  onSync: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm">
      <StatusDot status={connection.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{connection.label}</span>
          <span className="text-xs text-muted-foreground">
            {connection.accountCount} holding
            {connection.accountCount !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="text-xs">
          <TimeAgo date={connection.lastSyncedAt} />
        </div>
        {connection.errorMessage && (
          <p className="text-xs text-destructive mt-0.5">
            {connection.errorCode}: {connection.errorMessage}
          </p>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        disabled={syncing}
        onClick={onSync}
      >
        {syncing ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : (
          <RefreshCwIcon className="size-3.5" />
        )}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" />
          }
        >
          <MoreHorizontalIcon className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={onDisconnect}
            disabled={disconnecting}
            className="text-destructive focus:text-destructive"
          >
            <TrashIcon className="size-3.5 mr-2" />
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ── Coinbase connect form ──

function CoinbaseConnectForm() {
  const [keyName, setKeyName] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const createCoinbase = useCreateCoinbaseConnection();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!keyName.trim() || !privateKey.trim()) return;
    createCoinbase.mutate(
      { keyName: keyName.trim(), privateKey: privateKey.trim() },
      {
        onSuccess: (data) => {
          if (!data.connection.errorCode) {
            setKeyName("");
            setPrivateKey("");
          }
        },
      }
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 pt-2">
      <p className="text-xs text-muted-foreground">
        Create a read-only API key at{" "}
        <a
          href="https://www.coinbase.com/settings/api"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-foreground"
        >
          coinbase.com/settings/api
        </a>{" "}
        with the &ldquo;View&rdquo; permission, then paste the API key name
        and private key below.
      </p>
      <div className="space-y-1.5">
        <label className="text-xs font-medium" htmlFor="coinbase-key-name">
          API Key Name
        </label>
        <Input
          id="coinbase-key-name"
          value={keyName}
          onChange={(e) => setKeyName(e.target.value)}
          placeholder="organizations/…/apiKeys/…"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium" htmlFor="coinbase-private-key">
          Private Key
        </label>
        <Textarea
          id="coinbase-private-key"
          value={privateKey}
          onChange={(e) => setPrivateKey(e.target.value)}
          placeholder={"-----BEGIN EC PRIVATE KEY-----\n…\n-----END EC PRIVATE KEY-----"}
          autoComplete="off"
          spellCheck={false}
          rows={6}
          className="font-mono text-xs"
        />
      </div>
      <Button
        type="submit"
        size="sm"
        disabled={
          createCoinbase.isPending || !keyName.trim() || !privateKey.trim()
        }
      >
        {createCoinbase.isPending ? (
          <Loader2Icon className="size-4 animate-spin mr-1.5" />
        ) : null}
        Connect Coinbase
      </Button>
    </form>
  );
}

// ── Price feed row ──

const feedLabels: Record<string, string> = {
  yahoo: "Yahoo Finance",
  coingecko: "CoinGecko",
  frankfurter: "Frankfurter (FX)",
};

function PriceFeedRow({ feed }: { feed: PriceFeedStatus }) {
  return (
    <div className="flex items-center gap-3 py-1.5 text-sm">
      <StatusDot status={feed.status} />
      <span className="font-medium">{feedLabels[feed.name] ?? feed.name}</span>
      <span className="text-xs ml-auto">
        <TimeAgo date={feed.lastFetchAt} />
      </span>
    </div>
  );
}

// ── Main page ──

export default function ConnectionsPage() {
  const { data, isLoading } = useConnections();
  const syncAll = useSyncAll();
  const syncWallet = useSyncWallet();
  const syncPlaid = useSyncPlaid();
  const syncSimpleFIN = useSyncSimpleFIN();
  const syncCoinbase = useSyncCoinbase();
  const disconnectCoinbase = useDisconnectCoinbase();

  if (isLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Connections</h1>
          <p className="text-muted-foreground text-sm mt-1">
            All your data sources in one place.
          </p>
        </div>
        <Separator />
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  const wallets = data?.wallets ?? [];
  const plaid = data?.plaid ?? [];
  const simplefin = data?.simplefin ?? [];
  const coinbase = data?.coinbase ?? [];
  const priceFeeds = data?.priceFeeds ?? [];

  const walletsByChain = new Map<string, WalletConnection[]>();
  for (const w of wallets) {
    const chain = w.chain;
    const group = walletsByChain.get(chain) ?? [];
    group.push(w);
    walletsByChain.set(chain, group);
  }

  const totalConnections =
    wallets.length + plaid.length + simplefin.length + coinbase.length;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Connections</h1>
          <p className="text-muted-foreground text-sm mt-1">
            All your data sources in one place.
          </p>
        </div>
        <Button
          onClick={() => syncAll.mutate()}
          disabled={syncAll.isPending}
          size="sm"
        >
          {syncAll.isPending ? (
            <Loader2Icon className="size-4 animate-spin mr-1.5" />
          ) : (
            <RefreshCwIcon className="size-4 mr-1.5" />
          )}
          Sync all
        </Button>
      </div>

      <Separator />

      <Card>
        <CardContent className="pt-6 space-y-4">
            {/* Wallets */}
            {wallets.length > 0 && (
              <ConnectionSection
                title="Wallets"
                icon={WalletIcon}
                count={wallets.length}
              >
                {wallets.map((w) => (
                  <WalletRow
                    key={w.id}
                    wallet={w}
                    syncing={
                      syncWallet.isPending &&
                      syncWallet.variables === w.id
                    }
                    onSync={() => syncWallet.mutate(w.id)}
                  />
                ))}
              </ConnectionSection>
            )}

            {/* Plaid */}
            {plaid.length > 0 && (
              <>
                {wallets.length > 0 && (
                  <Separator className="my-2" />
                )}
                <ConnectionSection
                  title="Banks (Plaid)"
                  icon={LandmarkIcon}
                  count={plaid.length}
                >
                  {plaid.map((c) => (
                    <PlaidRow
                      key={c.id}
                      connection={c}
                      syncing={
                        syncPlaid.isPending &&
                        syncPlaid.variables === c.id
                      }
                      onSync={() => syncPlaid.mutate(c.id)}
                    />
                  ))}
                </ConnectionSection>
              </>
            )}

            {/* SimpleFIN */}
            {simplefin.length > 0 && (
              <>
                {(wallets.length > 0 || plaid.length > 0) && (
                  <Separator className="my-2" />
                )}
                <ConnectionSection
                  title="SimpleFIN"
                  icon={BanknoteIcon}
                  count={simplefin.length}
                >
                  {simplefin.map((c) => (
                    <SimpleFINRow
                      key={c.id}
                      connection={c}
                      syncing={
                        syncSimpleFIN.isPending &&
                        syncSimpleFIN.variables === c.id
                      }
                      onSync={() => syncSimpleFIN.mutate(c.id)}
                    />
                  ))}
                </ConnectionSection>
              </>
            )}

            {/* Coinbase */}
            {(wallets.length > 0 ||
              plaid.length > 0 ||
              simplefin.length > 0) && <Separator className="my-2" />}
            <ConnectionSection
              title="Coinbase"
              icon={BitcoinIcon}
              count={coinbase.length}
              defaultOpen
            >
              {coinbase.map((c) => (
                <CoinbaseRow
                  key={c.id}
                  connection={c}
                  syncing={
                    syncCoinbase.isPending && syncCoinbase.variables === c.id
                  }
                  disconnecting={
                    disconnectCoinbase.isPending &&
                    disconnectCoinbase.variables === c.id
                  }
                  onSync={() => syncCoinbase.mutate(c.id)}
                  onDisconnect={() => disconnectCoinbase.mutate(c.id)}
                />
              ))}
              {coinbase.length === 0 && <CoinbaseConnectForm />}
            </ConnectionSection>

            {/* Price feeds */}
            {priceFeeds.length > 0 && (
              <>
                <Separator className="my-2" />
                <ConnectionSection
                  title="Price feeds"
                  icon={ActivityIcon}
                  count={priceFeeds.length}
                  defaultOpen={totalConnections === 0}
                >
                  {priceFeeds.map((f) => (
                    <PriceFeedRow key={f.name} feed={f} />
                  ))}
                </ConnectionSection>
              </>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
