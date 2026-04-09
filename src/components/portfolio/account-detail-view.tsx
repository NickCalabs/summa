"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeftIcon, ChevronDownIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoneyDisplay } from "@/components/portfolio/money-display";
import { WalletInfoCard } from "@/components/portfolio/wallet-info-card";
import { usePortfolio, type Asset, type Portfolio } from "@/hooks/use-portfolio";
import { useUpdateAsset } from "@/hooks/use-assets";
import {
  useAssetSnapshots,
  type AssetSnapshot,
} from "@/hooks/use-snapshots";
import {
  useAssetTransactions,
  type Transaction,
} from "@/hooks/use-transactions";
import {
  findAssetLocation,
  findLinkedAssetForDebt,
  getAccountDetailKind,
  getOwnedAssetValue,
} from "@/lib/portfolio-utils";
import {
  convertToBase,
  formatNumberForInput,
  parseCurrencyInput,
} from "@/lib/currency";
import { cn } from "@/lib/utils";

interface AccountDetailViewProps {
  portfolioId: string;
  assetId: string;
  isModal?: boolean;
}

type AccountAsset = NonNullable<ReturnType<typeof findAssetLocation>>["asset"];
type DetailKind = ReturnType<typeof getAccountDetailKind>;

interface BenchmarkRow {
  label: string;
  rate: number;
  value: number | null;
  delta: number | null;
  deltaPct: number | null;
}

interface BrokerageAnalytics {
  isLoading: boolean;
  transactions: Transaction[];
  snapshots: AssetSnapshot[];
  positionName: string;
  ticker: string | null;
  quantity: number | null;
  price: number | null;
  currentValue: number;
  costBasis: number | null;
  costBasisSource: "manual" | "derived" | "missing";
  ownedValue: number;
  ownedCostBasis: number | null;
  netContributions: number;
  realizedOutflows: number;
  unrealizedGain: number | null;
  unrealizedGainPct: number | null;
  estimatedTaxRate: number;
  estimatedTax: number | null;
  ownedEstimatedTax: number | null;
  irr: number | null;
  firstTrackedAt: string | null;
  lastActivityAt: string | null;
  yearsHeld: number;
  periodChange: number | null;
  periodChangePct: number | null;
  benchmarks: BenchmarkRow[];
  totalCommissions: number;
}

const BENCHMARKS = [
  { label: "Cash", rate: 0.04 },
  { label: "60 / 40", rate: 0.07 },
  { label: "S&P 500", rate: 0.1 },
] as const;

export function AccountDetailView({
  portfolioId,
  assetId,
  isModal = false,
}: AccountDetailViewProps) {
  const { data: portfolio, isLoading, error } = usePortfolio(portfolioId);
  const updateAsset = useUpdateAsset(portfolioId);
  const assetLocation = useMemo(
    () => (portfolio ? findAssetLocation(portfolio, assetId) : null),
    [portfolio, assetId]
  );
  const detailKind = assetLocation
    ? getAccountDetailKind(assetLocation.sheet, assetLocation.asset)
    : null;
  const analytics = useBrokerageAnalytics(
    detailKind === "brokerage" ? assetLocation?.asset ?? null : null
  );

  if (isLoading) {
    return (
      <div className={isModal ? "space-y-8" : "mx-auto max-w-7xl space-y-8 p-6 md:p-8"}>
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-12 w-full rounded-2xl" />
        <Skeleton className="h-[360px] w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !portfolio || !assetLocation) {
    return (
      <div className={isModal ? "space-y-4" : "mx-auto max-w-7xl space-y-4 p-6 md:p-8"}>
        <p className="text-lg font-medium">Account not found</p>
        {!isModal && (
          <Link href={`/portfolio/${portfolioId}`}>
            <Button variant="outline" size="sm">
              <ArrowLeftIcon className="size-4" data-icon="inline-start" />
              Back to portfolio
            </Button>
          </Link>
        )}
      </div>
    );
  }

  const { asset, sheet, section } = assetLocation;
  const resolvedDetailKind = detailKind as DetailKind;
  const defaultTab =
    resolvedDetailKind === "debt"
      ? "debt"
      : resolvedDetailKind === "brokerage"
        ? "holdings"
        : "value";

  return (
    <div className={isModal ? "space-y-8" : "mx-auto max-w-7xl space-y-8 p-6 md:p-8"}>
      {!isModal && (
        <Link href={`/portfolio/${portfolioId}?sheet=${sheet.id}`}>
          <Button
            variant="ghost"
            size="sm"
            className="px-0 text-muted-foreground"
          >
            <ArrowLeftIcon className="size-4" data-icon="inline-start" />
            Back to {sheet.name}
          </Button>
        </Link>
      )}

      <AccountHero
        asset={asset}
        sectionName={section.name}
        sheetName={sheet.name}
        detailKind={resolvedDetailKind}
        portfolioCurrency={portfolio.currency}
        rates={portfolio.rates}
        analytics={analytics}
      />

      <Tabs defaultValue={defaultTab} className="gap-5">
        <TabsList
          variant="line"
          className="w-full flex-wrap justify-start gap-5 border-b border-border/60 pb-2"
        >
          {resolvedDetailKind === "debt" ? (
            <>
              <TabsTrigger value="debt" className="flex-none px-0">
                Debt
              </TabsTrigger>
              <TabsTrigger value="balance" className="flex-none px-0">
                Balance
              </TabsTrigger>
              <TabsTrigger value="ownership" className="flex-none px-0">
                Ownership
              </TabsTrigger>
              <TabsTrigger value="notes" className="flex-none px-0">
                Notes
              </TabsTrigger>
            </>
          ) : resolvedDetailKind === "brokerage" ? (
            <>
              <TabsTrigger value="holdings" className="flex-none px-0">
                Holdings
              </TabsTrigger>
              <TabsTrigger value="value" className="flex-none px-0">
                Value
              </TabsTrigger>
              <TabsTrigger value="returns" className="flex-none px-0">
                Returns
              </TabsTrigger>
              <TabsTrigger value="reporting" className="flex-none px-0">
                Reporting
              </TabsTrigger>
              <TabsTrigger value="assorted" className="flex-none px-0">
                Assorted
              </TabsTrigger>
              <TabsTrigger value="notes" className="flex-none px-0">
                Notes
              </TabsTrigger>
              <TabsTrigger value="documents" className="flex-none px-0">
                Documents
              </TabsTrigger>
            </>
          ) : (
            <>
              <TabsTrigger value="value" className="flex-none px-0">
                Value
              </TabsTrigger>
              <TabsTrigger value="reporting" className="flex-none px-0">
                Reporting
              </TabsTrigger>
              <TabsTrigger value="assorted" className="flex-none px-0">
                Assorted
              </TabsTrigger>
              <TabsTrigger value="notes" className="flex-none px-0">
                Notes
              </TabsTrigger>
            </>
          )}
        </TabsList>

        {resolvedDetailKind === "debt" ? (
          <>
            <TabsContent value="debt">
              <DebtTab
                key={`${asset.id}-${asset.currentValue}`}
                asset={asset}
                portfolio={portfolio}
                updateAsset={updateAsset}
              />
            </TabsContent>
            <TabsContent value="balance">
              <HistoryTab assetId={asset.id} currency={asset.currency} />
            </TabsContent>
            <TabsContent value="ownership">
              <OwnershipTab
                key={`${asset.id}-${asset.ownershipPct}`}
                asset={asset}
                updateAsset={updateAsset}
              />
            </TabsContent>
            <TabsContent value="notes">
              <NotesTab
                key={`${asset.id}-${asset.updatedAt}-notes`}
                asset={asset}
                updateAsset={updateAsset}
              />
            </TabsContent>
          </>
        ) : resolvedDetailKind === "brokerage" ? (
          <>
            <TabsContent value="holdings">
              <BrokerageHoldingsTab
                asset={asset}
                analytics={analytics}
                portfolioId={portfolioId}
              />
            </TabsContent>
            <TabsContent value="value">
              <BrokerageValueTab
                asset={asset}
                analytics={analytics}
                updateAsset={updateAsset}
              />
            </TabsContent>
            <TabsContent value="returns">
              <BrokerageReturnsTab asset={asset} analytics={analytics} />
            </TabsContent>
            <TabsContent value="reporting">
              <BrokerageReportingTab
                asset={asset}
                sheetName={sheet.name}
                sectionName={section.name}
                analytics={analytics}
              />
            </TabsContent>
            <TabsContent value="assorted">
              <BrokerageAssortedTab
                asset={asset}
                analytics={analytics}
                updateAsset={updateAsset}
              />
            </TabsContent>
            <TabsContent value="notes">
              <NotesTab
                key={`${asset.id}-${asset.updatedAt}-notes`}
                asset={asset}
                updateAsset={updateAsset}
              />
            </TabsContent>
            <TabsContent value="documents">
              <DocumentsTab asset={asset} />
            </TabsContent>
          </>
        ) : (
          <>
            <TabsContent value="value">
              <ValueTab
                asset={asset}
                detailKind={resolvedDetailKind}
                updateAsset={updateAsset}
              />
            </TabsContent>
            <TabsContent value="reporting">
              <ReportingTab
                asset={asset}
                detailKind={resolvedDetailKind}
                updateAsset={updateAsset}
              />
            </TabsContent>
            <TabsContent value="assorted">
              <OwnershipTab
                key={`${asset.id}-${asset.ownershipPct}`}
                asset={asset}
                updateAsset={updateAsset}
              />
            </TabsContent>
            <TabsContent value="notes">
              <NotesTab
                key={`${asset.id}-${asset.updatedAt}-notes`}
                asset={asset}
                updateAsset={updateAsset}
              />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}

function AccountHero({
  asset,
  sectionName,
  sheetName,
  detailKind,
  portfolioCurrency,
  rates,
  analytics,
}: {
  asset: AccountAsset;
  sectionName: string;
  sheetName: string;
  detailKind: DetailKind;
  portfolioCurrency: string;
  rates: Record<string, number>;
  analytics: BrokerageAnalytics;
}) {
  const currentValue = Number(asset.currentValue);
  const ownedValue = getOwnedAssetValue(asset);
  const ownershipPct = Number(asset.ownershipPct ?? 100);
  const baseValue =
    asset.currency !== portfolioCurrency
      ? convertToBase(currentValue, asset.currency, portfolioCurrency, rates)
      : null;

  return (
    <header className="border-b border-border/60 pb-8">
      <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <span>{sheetName}</span>
            <span>{sectionName}</span>
            <span>{DETAIL_KIND_LABELS[detailKind]}</span>
            <span>{getProviderLabel(asset.providerType)}</span>
          </div>

          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
              {asset.name}
            </h1>
            <MoneyDisplay
              amount={currentValue}
              currency={asset.currency}
              className="text-5xl font-semibold tracking-tight md:text-6xl"
            />
            {baseValue !== null && (
              <p className="text-sm text-muted-foreground">
                Approx.{" "}
                <MoneyDisplay amount={baseValue} currency={portfolioCurrency} />{" "}
                in portfolio currency
              </p>
            )}
          </div>
        </div>

        <div className="grid w-full gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/70 sm:grid-cols-2 xl:max-w-3xl xl:grid-cols-4">
          <HeroStat
            label="Owned value"
            value={<MoneyDisplay amount={ownedValue} currency={asset.currency} />}
            detail={`Ownership ${ownershipPct.toFixed(2).replace(/\.00$/, "")}%`}
          />
          {detailKind === "brokerage" ? (
            <>
              <HeroStat
                label="Cost basis"
                value={renderMoneyValue(analytics.costBasis, asset.currency)}
                detail={
                  analytics.costBasisSource === "manual"
                    ? "Manual basis"
                    : analytics.costBasisSource === "derived"
                      ? "Derived from activity"
                      : "Basis not set"
                }
              />
              <HeroStat
                label="Unrealized"
                value={renderSignedMoneyValue(
                  analytics.unrealizedGain,
                  asset.currency
                )}
                detail={formatPercent(analytics.unrealizedGainPct)}
              />
              <HeroStat
                label="IRR"
                value={formatPercent(analytics.irr, { digits: 1 })}
                detail={
                  analytics.firstTrackedAt
                    ? `Since ${formatShortDate(analytics.firstTrackedAt)}`
                    : "Need basis or transactions"
                }
              />
            </>
          ) : (
            <>
              <HeroStat
                label="Type"
                value={asset.type}
                detail={asset.isInvestable ? "Investable" : "Non-investable"}
              />
              <HeroStat
                label="Status"
                value={asset.isCashEquivalent ? "Cash equivalent" : "Tracked"}
                detail={
                  asset.lastSyncedAt
                    ? `Synced ${formatShortDateTime(asset.lastSyncedAt)}`
                    : "Manual account"
                }
              />
              <HeroStat label="Currency" value={asset.currency} detail="Native value" />
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function ValueTab({
  asset,
  detailKind,
  updateAsset,
}: {
  asset: AccountAsset;
  detailKind: Exclude<DetailKind, "brokerage" | "debt">;
  updateAsset: ReturnType<typeof useUpdateAsset>;
}) {
  const [value, setValue] = useState("");
  const isCashAccount = detailKind === "cash";

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = parseCurrencyInput(value, asset.currency);
    if (parsed.amount !== 0 || value.trim() === "0") {
      updateAsset.mutate({ id: asset.id, currentValue: String(parsed.amount) });
      setValue("");
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricSurface
          label={isCashAccount ? "Balance" : "Current value"}
          value={<MoneyDisplay amount={Number(asset.currentValue)} currency={asset.currency} />}
          detail={isCashAccount ? "Ledger balance" : "Latest account mark"}
        />
        <MetricSurface
          label="Owned value"
          value={<MoneyDisplay amount={getOwnedAssetValue(asset)} currency={asset.currency} />}
          detail={`Ownership ${Number(asset.ownershipPct ?? 100).toFixed(2).replace(/\.00$/, "")}%`}
        />
        <MetricSurface
          label="Treatment"
          value={isCashAccount ? "Cash ledger" : "Tracked asset"}
          detail={asset.isInvestable ? "Included in investable totals" : "Excluded from investable totals"}
        />
      </div>

      <HistoryTab
        assetId={asset.id}
        currency={asset.currency}
        title={isCashAccount ? "Balance history" : "Value history"}
      />

      <StatementSurface
        title={isCashAccount ? "Account posture" : "Account facts"}
        rows={[
          { label: "Provider", value: getProviderLabel(asset.providerType) },
          { label: "Type", value: asset.type },
          { label: "Cash equivalent", value: asset.isCashEquivalent ? "Yes" : "No" },
          { label: "Investable", value: asset.isInvestable ? "Yes" : "No" },
        ]}
      />

      <Surface
        title={isCashAccount ? "Manual balance update" : "Manual value update"}
        description={
          isCashAccount
            ? "Use this for checking, savings, and other balance-ledger accounts."
            : "Update the latest marked value when this account is tracked as a single line item."
        }
      >
        <form onSubmit={handleSubmit} className="flex max-w-xl gap-3">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={isCashAccount ? "Update balance" : "Update value"}
            inputMode="decimal"
          />
          <Button type="submit">Save</Button>
        </form>
      </Surface>
    </div>
  );
}

function BrokerageHoldingsTab({
  asset,
  analytics,
  portfolioId,
}: {
  asset: AccountAsset;
  analytics: BrokerageAnalytics;
  portfolioId: string;
}) {
  const walletConfig = asset.providerConfig as
    | { chain?: string; address?: string }
    | null;
  const isBtcWallet =
    asset.providerType === "wallet" && walletConfig?.chain === "btc";

  return (
    <div className="space-y-6">
      {isBtcWallet && (
        <WalletInfoCard asset={asset} portfolioId={portfolioId} />
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <MetricSurface
          label="Quantity"
          value={formatQuantity(analytics.quantity)}
          detail={analytics.ticker ?? "Tracked position"}
        />
        <MetricSurface
          label="Price"
          value={renderMoneyValue(analytics.price, asset.currency)}
          detail="Latest marked price"
        />
        <MetricSurface
          label="Basis source"
          value={
            analytics.costBasisSource === "manual"
              ? "Manual"
              : analytics.costBasisSource === "derived"
                ? "Activity"
                : "Missing"
          }
          detail="How basis is being surfaced"
        />
      </div>

      <Surface
        title="Positions"
        description="Holdings-first ledger for this brokerage account."
      >
        <LedgerTable
          columns={["Holding", "Qty", "Price", "Cost basis", "Value", "Gain"]}
          rows={[
            [
              <div key="holding" className="space-y-1">
                <div className="font-medium text-foreground">
                  {analytics.positionName}
                </div>
                <div className="text-xs text-muted-foreground">
                  {analytics.ticker ?? "Whole account position"}
                </div>
              </div>,
              formatQuantity(analytics.quantity),
              renderMoneyValue(analytics.price, asset.currency),
              renderMoneyValue(analytics.costBasis, asset.currency),
              <MoneyDisplay
                key="value"
                amount={analytics.currentValue}
                currency={asset.currency}
              />,
              renderSignedMoneyValue(analytics.unrealizedGain, asset.currency),
            ],
          ]}
        />
      </Surface>

      <Surface
        title="Activity ledger"
        description="Buys, sells, deposits, and withdrawals feeding the account."
      >
        {analytics.isLoading ? (
          <Skeleton className="h-48 rounded-xl" />
        ) : analytics.transactions.length > 0 ? (
          <LedgerTable
            columns={["Date", "Type", "Qty", "Price", "Commission", "Cash flow", "Notes"]}
            rows={analytics.transactions.map((tx) => [
              formatShortDate(tx.date),
              TRANSACTION_TYPE_LABELS[tx.type],
              formatQuantity(toNumberOrNull(tx.quantity)),
              renderMoneyValue(toNumberOrNull(tx.price), asset.currency),
              renderMoneyValue(getCommissionAmount(tx), asset.currency),
              renderSignedMoneyValue(getContributionAmount(tx), asset.currency),
              tx.notes || "—",
            ])}
          />
        ) : (
          <EmptyState message="No transactions yet. This ledger will tighten up as activity lands." />
        )}
      </Surface>
    </div>
  );
}

function BrokerageValueTab({
  asset,
  analytics,
  updateAsset,
}: {
  asset: AccountAsset;
  analytics: BrokerageAnalytics;
  updateAsset: ReturnType<typeof useUpdateAsset>;
}) {
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = parseCurrencyInput(value, asset.currency);
    if (parsed.amount !== 0 || value.trim() === "0") {
      updateAsset.mutate({ id: asset.id, currentValue: String(parsed.amount) });
      setValue("");
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricSurface
          label="Current value"
          value={<MoneyDisplay amount={analytics.currentValue} currency={asset.currency} />}
          detail="Latest account mark"
        />
        <MetricSurface
          label="1Y change"
          value={renderSignedMoneyValue(analytics.periodChange, asset.currency)}
          detail={formatPercent(analytics.periodChangePct)}
        />
        <MetricSurface
          label="Owned basis"
          value={renderMoneyValue(analytics.ownedCostBasis, asset.currency)}
          detail="Ownership-adjusted basis"
        />
      </div>

      <HistoryTab assetId={asset.id} currency={asset.currency} title="Value history" />

      <Surface title="Manual override" description="Adjust the latest market value when needed.">
        <form onSubmit={handleSubmit} className="flex max-w-xl gap-3">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Update marked value"
            inputMode="decimal"
          />
          <Button type="submit">Save</Button>
        </form>
      </Surface>
    </div>
  );
}

function BrokerageReturnsTab({
  asset,
  analytics,
}: {
  asset: AccountAsset;
  analytics: BrokerageAnalytics;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
        <Surface
          title="IRR"
          description="Estimated money-weighted return based on stored cash flows plus current value."
        >
          <div className="space-y-4">
            <div className="text-5xl font-semibold tracking-tight">
              {formatPercent(analytics.irr, { digits: 1 })}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <MetricInline
                label="Cost basis"
                value={renderMoneyValue(analytics.costBasis, asset.currency)}
              />
              <MetricInline
                label="Net contributions"
                value={renderMoneyValue(analytics.netContributions, asset.currency)}
              />
              <MetricInline
                label="Commissions"
                value={renderMoneyValue(analytics.totalCommissions, asset.currency)}
              />
              <MetricInline
                label="Unrealized gain"
                value={renderSignedMoneyValue(analytics.unrealizedGain, asset.currency)}
              />
            </div>
          </div>
        </Surface>

        <StatementSurface
          title="Return summary"
          rows={[
            {
              label: "Gain / loss",
              value: renderSignedMoneyValue(analytics.unrealizedGain, asset.currency),
            },
            {
              label: "Return %",
              value: formatPercent(analytics.unrealizedGainPct),
            },
            {
              label: "Estimated tax",
              value: renderMoneyValue(analytics.estimatedTax, asset.currency),
            },
            {
              label: "Commissions paid",
              value: renderMoneyValue(analytics.totalCommissions, asset.currency),
            },
            {
              label: "Held since",
              value: analytics.firstTrackedAt
                ? formatShortDate(analytics.firstTrackedAt)
                : "—",
            },
          ]}
        />
      </div>

      <Surface
        title="Benchmark comparisons"
        description="Simple compounding checkpoints using the same tracked capital base."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {analytics.benchmarks.map((benchmark) => (
            <div
              key={benchmark.label}
              className="rounded-xl border border-border/70 bg-background/70 p-4"
            >
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-muted-foreground">
                <span>{benchmark.label}</span>
                <span>{Math.round(benchmark.rate * 100)}%</span>
              </div>
              <div className="mt-3 text-2xl font-semibold tracking-tight">
                {renderMoneyValue(benchmark.value, asset.currency)}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                {benchmark.delta === null
                  ? "Need more history"
                  : `${benchmark.delta >= 0 ? "Ahead" : "Behind"} ${formatMoney(Math.abs(benchmark.delta), asset.currency)}`}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {formatPercent(benchmark.deltaPct)}
              </div>
            </div>
          ))}
        </div>
      </Surface>
    </div>
  );
}

function BrokerageReportingTab({
  asset,
  sheetName,
  sectionName,
  analytics,
}: {
  asset: AccountAsset;
  sheetName: string;
  sectionName: string;
  analytics: BrokerageAnalytics;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <StatementSurface
        title="Reporting surfaces"
        rows={[
          { label: "Sheet", value: sheetName },
          { label: "Section", value: sectionName },
          { label: "Account type", value: asset.type },
          { label: "Provider", value: getProviderLabel(asset.providerType) },
          {
            label: "Last activity",
            value: analytics.lastActivityAt
              ? formatShortDate(analytics.lastActivityAt)
              : "—",
          },
          {
            label: "Last sync",
            value: asset.lastSyncedAt
              ? formatShortDateTime(asset.lastSyncedAt)
              : "Manual",
          },
          {
            label: "Snapshot coverage",
            value: `${analytics.snapshots.length} points`,
          },
          {
            label: "Transaction ledger",
            value: `${analytics.transactions.length} rows`,
          },
        ]}
      />

      <StatementSurface
        title="Ownership and basis"
        rows={[
          { label: "Ownership", value: `${Number(asset.ownershipPct ?? 100)}%` },
          {
            label: "Owned value",
            value: renderMoneyValue(analytics.ownedValue, asset.currency),
          },
          {
            label: "Owned cost basis",
            value: renderMoneyValue(analytics.ownedCostBasis, asset.currency),
          },
          {
            label: "Tax estimate",
            value: renderMoneyValue(analytics.ownedEstimatedTax, asset.currency),
          },
          {
            label: "Investable",
            value: asset.isInvestable ? "Yes" : "No",
          },
          {
            label: "Cash equivalent",
            value: asset.isCashEquivalent ? "Yes" : "No",
          },
          {
            label: "Tax status",
            value: asset.taxStatus ? formatTaxStatus(asset.taxStatus) : "Unspecified",
          },
          {
            label: "Basis source",
            value:
              analytics.costBasisSource === "manual"
                ? "Manual cost basis"
                : analytics.costBasisSource === "derived"
                  ? "Estimated from ledger"
                  : "Missing",
          },
        ]}
      />
    </div>
  );
}

function BrokerageAssortedTab({
  asset,
  analytics,
  updateAsset,
}: {
  asset: AccountAsset;
  analytics: BrokerageAnalytics;
  updateAsset: ReturnType<typeof useUpdateAsset>;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
      <Surface
        title="Assorted account settings"
        description="Ownership, basis, and classification surfaces for the brokerage account."
      >
        <div className="space-y-4">
          <EditableRow label="Ownership %">
            <BlurCommitInput
              value={formatNumberForInput(asset.ownershipPct)}
              onCommit={(nextValue) =>
                updateAsset.mutate({ id: asset.id, ownershipPct: nextValue })
              }
              placeholder="100"
              inputMode="decimal"
            />
          </EditableRow>

          <EditableRow label="Cost basis">
            <BlurCommitInput
              value={formatNumberForInput(asset.costBasis)}
              onCommit={(nextValue) => {
                const parsed = parseCurrencyInput(nextValue);
                updateAsset.mutate({
                  id: asset.id,
                  costBasis:
                    parsed.amount || nextValue.trim() === "0"
                      ? parsed.amount.toString()
                      : null,
                });
              }}
              placeholder="0.00"
              inputMode="decimal"
            />
          </EditableRow>

          <EditableRow label="Current value">
            <BlurCommitInput
              value={formatNumberForInput(asset.currentValue)}
              onCommit={(nextValue) => {
                const parsed = parseCurrencyInput(nextValue, asset.currency);
                if (parsed.amount !== 0 || nextValue.trim() === "0") {
                  updateAsset.mutate({
                    id: asset.id,
                    currentValue: parsed.amount.toString(),
                  });
                }
              }}
              placeholder="0.00"
              inputMode="decimal"
            />
          </EditableRow>

          <EditableRow label="Investable">
            <ToggleButton
              active={asset.isInvestable}
              onClick={() =>
                updateAsset.mutate({
                  id: asset.id,
                  isInvestable: !asset.isInvestable,
                })
              }
            >
              {asset.isInvestable ? "Yes" : "No"}
            </ToggleButton>
          </EditableRow>

          <EditableRow label="Cash equivalent">
            <ToggleButton
              active={asset.isCashEquivalent}
              onClick={() =>
                updateAsset.mutate({
                  id: asset.id,
                  isCashEquivalent: !asset.isCashEquivalent,
                })
              }
            >
              {asset.isCashEquivalent ? "Yes" : "No"}
            </ToggleButton>
          </EditableRow>
        </div>
      </Surface>

      <StatementSurface
        title="Tax and basis estimates"
        rows={[
          {
            label: "Estimated tax rate",
            value: `${Math.round(analytics.estimatedTaxRate * 100)}%`,
          },
          {
            label: "Estimated tax",
            value: renderMoneyValue(analytics.estimatedTax, asset.currency),
          },
          {
            label: "Owned estimated tax",
            value: renderMoneyValue(analytics.ownedEstimatedTax, asset.currency),
          },
          {
            label: "Cost basis source",
            value:
              analytics.costBasisSource === "manual"
                ? "Manual basis"
                : analytics.costBasisSource === "derived"
                  ? "Derived estimate"
                  : "Missing basis",
          },
          {
            label: "Realized outflows",
            value: renderMoneyValue(analytics.realizedOutflows, asset.currency),
          },
          {
            label: "Commissions paid",
            value: renderMoneyValue(analytics.totalCommissions, asset.currency),
          },
        ]}
      />
    </div>
  );
}

function DebtTab({
  asset,
  portfolio,
  updateAsset,
}: {
  asset: AccountAsset;
  portfolio: Portfolio;
  updateAsset: ReturnType<typeof useUpdateAsset>;
}) {
  const [balance, setBalance] = useState(String(Number(asset.currentValue)));
  const linkedAssetLocation = useMemo(
    () => findLinkedAssetForDebt(portfolio, asset.id),
    [portfolio, asset.id]
  );
  const linkableAssets = useMemo(
    () =>
      portfolio.sheets
        .filter((sheet) => sheet.type === "assets")
        .flatMap((sheet) =>
          sheet.sections.flatMap((section) =>
            section.assets.map((candidate) => ({
              sheetName: sheet.name,
              sectionName: section.name,
              asset: candidate,
            }))
          )
        )
        .filter(
          (candidate) =>
            candidate.asset.linkedDebtId == null ||
            candidate.asset.linkedDebtId === asset.id
        )
        .sort((left, right) => left.asset.name.localeCompare(right.asset.name)),
    [asset.id, portfolio]
  );

  async function assignLinkedAsset(nextAssetId: string | null) {
    const currentLinkedAssetId = linkedAssetLocation?.asset.id ?? null;
    if (currentLinkedAssetId === nextAssetId) return;

    if (currentLinkedAssetId) {
      await updateAsset.mutateAsync({
        id: currentLinkedAssetId,
        linkedDebtId: null,
      });
    }

    if (nextAssetId) {
      await updateAsset.mutateAsync({
        id: nextAssetId,
        linkedDebtId: asset.id,
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricSurface
          label="Outstanding balance"
          value={<MoneyDisplay amount={Number(asset.currentValue)} currency={asset.currency} />}
          detail="Current liability"
        />
        <MetricSurface
          label="Owned balance"
          value={<MoneyDisplay amount={getOwnedAssetValue(asset)} currency={asset.currency} />}
          detail={`Ownership ${Number(asset.ownershipPct ?? 100).toFixed(2).replace(/\.00$/, "")}%`}
        />
        <MetricSurface
          label="Secured by"
          value={linkedAssetLocation?.asset.name ?? "Standalone debt"}
          detail={
            linkedAssetLocation
              ? `${linkedAssetLocation.sheet.name} / ${linkedAssetLocation.section.name}`
              : "Not linked to an asset"
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
      <Surface
        title="Debt balance"
        description="Track the liability directly and refresh the current balance over time."
      >
        <div className="space-y-4 text-sm text-muted-foreground">
          <p>
            Enter the current balance manually and refresh it whenever the debt
            changes. This keeps the account dense, quiet, and spreadsheet-like.
          </p>
          <Input
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            onBlur={() => {
              const parsed = parseCurrencyInput(balance, asset.currency);
              updateAsset.mutate({
                id: asset.id,
                currentValue: String(parsed.amount),
              });
            }}
            className="h-16 text-2xl"
            inputMode="decimal"
          />
          <div className="grid gap-4 md:grid-cols-2">
            <MetricInline
              label="Ownership"
              value={`${Number(asset.ownershipPct ?? 100).toFixed(2).replace(/\.00$/, "")}%`}
            />
            <MetricInline
              label="Linked asset ownership"
              value={
                linkedAssetLocation
                  ? `${Number(linkedAssetLocation.asset.ownershipPct ?? 100)
                      .toFixed(2)
                      .replace(/\.00$/, "")}%`
                  : "—"
              }
            />
          </div>
        </div>
      </Surface>

      <div className="space-y-6">
        <Surface
          title="Debt rule"
          description="Link this debt to the asset it belongs to so ownership has a real anchor."
        >
          <div className="space-y-4">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" className="w-full justify-between" />
                }
              >
                {linkedAssetLocation?.asset.name ?? "Select linked asset"}
                <ChevronDownIcon className="size-4 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-80 w-72 overflow-y-auto">
                <DropdownMenuItem onSelect={() => void assignLinkedAsset(null)}>
                  No linked asset
                </DropdownMenuItem>
                {linkableAssets.map((candidate) => (
                  <DropdownMenuItem
                    key={candidate.asset.id}
                    onSelect={() => void assignLinkedAsset(candidate.asset.id)}
                  >
                    <div className="flex flex-col">
                      <span>{candidate.asset.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {candidate.sheetName} / {candidate.sectionName}
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <StatementSurface
              title="Debt behavior"
              rows={[
                {
                  label: "Counting rule",
                  value: "Balance counts according to debt ownership",
                },
                {
                  label: "Linked asset",
                  value: linkedAssetLocation?.asset.name ?? "None",
                },
                {
                  label: "Ownership parity",
                  value:
                    linkedAssetLocation &&
                    linkedAssetLocation.asset.ownershipPct === asset.ownershipPct
                      ? "Matched"
                      : linkedAssetLocation
                        ? "Different"
                        : "Not applicable",
                },
              ]}
            />
          </div>
        </Surface>
      </div>
      </div>
    </div>
  );
}

function ReportingTab({
  asset,
  detailKind,
  updateAsset,
}: {
  asset: AccountAsset;
  detailKind: Exclude<DetailKind, "brokerage" | "debt">;
  updateAsset: ReturnType<typeof useUpdateAsset>;
}) {
  const isCashAccount = detailKind === "cash";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Surface
        title={isCashAccount ? "Cash treatment" : "Reporting treatment"}
        description={
          isCashAccount
            ? "Decide whether this balance behaves like spendable cash or just another tracked line."
            : "Mark whether the account should be treated as liquid and investable."
        }
      >
        <div className="space-y-3 pt-1">
          <RadioRow
            active={asset.isInvestable && asset.isCashEquivalent}
            label={isCashAccount ? "Cash on hand" : "Investable cash"}
            onClick={() =>
              updateAsset.mutate({
                id: asset.id,
                isInvestable: true,
                isCashEquivalent: true,
              })
            }
          />
          <RadioRow
            active={asset.isInvestable && !asset.isCashEquivalent}
            label={isCashAccount ? "Investable, but not cash-on-hand" : "Investable, not cash-equivalent"}
            onClick={() =>
              updateAsset.mutate({
                id: asset.id,
                isInvestable: true,
                isCashEquivalent: false,
              })
            }
          />
          <RadioRow
            active={!asset.isInvestable}
            label="Non-investable"
            onClick={() =>
              updateAsset.mutate({
                id: asset.id,
                isInvestable: false,
                isCashEquivalent: false,
              })
            }
          />
        </div>
      </Surface>

      <StatementSurface
        title="Current reporting state"
        rows={[
          { label: "Account type", value: isCashAccount ? "Cash account" : "Tracked asset" },
          { label: "Investable", value: asset.isInvestable ? "Yes" : "No" },
          { label: "Cash equivalent", value: asset.isCashEquivalent ? "Yes" : "No" },
          { label: "Provider", value: getProviderLabel(asset.providerType) },
        ]}
      />
    </div>
  );
}

function OwnershipTab({
  asset,
  updateAsset,
}: {
  asset: AccountAsset;
  updateAsset: ReturnType<typeof useUpdateAsset>;
}) {
  const [ownership, setOwnership] = useState(asset.ownershipPct ?? "100");

  return (
    <Surface
      title="Ownership"
      description="Adjust your share if the account is jointly owned."
      className="max-w-4xl"
    >
      <Input
        value={ownership}
        onChange={(e) => setOwnership(e.target.value)}
        onBlur={() =>
          updateAsset.mutate({ id: asset.id, ownershipPct: ownership })
        }
        className="h-16 text-2xl"
        inputMode="decimal"
      />
    </Surface>
  );
}

function NotesTab({
  asset,
  updateAsset,
}: {
  asset: AccountAsset;
  updateAsset: ReturnType<typeof useUpdateAsset>;
}) {
  const [notes, setNotes] = useState(asset.notes ?? "");

  return (
    <Surface
      title="Notes"
      description="Private account notes, reminders, or reconciliations."
      className="max-w-5xl"
    >
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() =>
          updateAsset.mutate({ id: asset.id, notes: notes.trim() || null })
        }
        className="min-h-[240px] text-base"
        placeholder="Add notes about this account..."
      />
    </Surface>
  );
}

function DocumentsTab({ asset }: { asset: AccountAsset }) {
  return (
    <Surface
      title="Documents"
      description="Statement and attachment surfaces for this account."
      className="max-w-4xl"
    >
      <EmptyState
        message={`No stored documents for ${asset.name} yet.`}
        detail="A future pass can wire statements, tax docs, and PDFs into this tab."
      />
    </Surface>
  );
}

function HistoryTab({
  assetId,
  currency,
  title = "History",
}: {
  assetId: string;
  currency: string;
  title?: string;
}) {
  const from = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return toDateString(d);
  }, []);
  const { data: snapshots, isLoading } = useAssetSnapshots(assetId, from);
  const rows = useMemo(
    () =>
      (snapshots ? [...snapshots] : []).sort((a, b) =>
        b.date.localeCompare(a.date)
      ),
    [snapshots]
  );

  return (
    <div className="space-y-6">
      <Surface title={title} description="Recent valuation history for the account.">
        <div className="space-y-5">
          <div className="h-56 rounded-xl border border-border/70 bg-muted/10 p-4">
            {isLoading ? (
              <Skeleton className="h-full w-full rounded-lg" />
            ) : (
              <MiniChart values={rows.map((row) => Number(row.value)).reverse()} />
            )}
          </div>

          {rows.length > 0 ? (
            <LedgerTable
              columns={["Date", "Value", "Quantity", "Price"]}
              rows={rows.map((snapshot) => [
                formatSnapshotDate(snapshot.date),
                <MoneyDisplay
                  key={`${snapshot.id}-value`}
                  amount={Number(snapshot.value)}
                  currency={currency}
                />,
                formatQuantity(toNumberOrNull(snapshot.quantity)),
                renderMoneyValue(toNumberOrNull(snapshot.price), currency),
              ])}
            />
          ) : isLoading ? null : (
            <EmptyState message="No history yet." />
          )}
        </div>
      </Surface>
    </div>
  );
}

function Surface({
  title,
  description,
  className,
  children,
}: {
  title: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border/70 bg-background/70 p-5 md:p-6",
        className
      )}
    >
      <div className="mb-5 space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function StatementSurface({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: React.ReactNode }[];
}) {
  return (
    <Surface title={title}>
      <div className="overflow-hidden rounded-xl border border-border/70">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.label}
                className="border-b border-border/70 last:border-b-0"
              >
                <td className="px-4 py-3 text-muted-foreground">{row.label}</td>
                <td className="px-4 py-3 text-right font-medium">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Surface>
  );
}

function HeroStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: React.ReactNode;
  detail?: string;
}) {
  return (
    <div className="bg-background/90 px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail || " "}</div>
    </div>
  );
}

function MetricSurface({
  label,
  value,
  detail,
}: {
  label: string;
  value: React.ReactNode;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {detail ? <div className="mt-1 text-xs text-muted-foreground">{detail}</div> : null}
    </div>
  );
}

function MetricInline({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/50 px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-base font-medium">{value}</div>
    </div>
  );
}

function LedgerTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/70">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border/70 bg-muted/20 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          <tr>
            {columns.map((column, index) => (
              <th
                key={column}
                className={cn(
                  "px-4 py-3",
                  index === 0 ? "text-left" : "text-right"
                )}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className="border-b border-border/70 last:border-b-0"
            >
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={cn(
                    "px-4 py-3 align-top",
                    cellIndex === 0
                      ? "text-left"
                      : "text-right tabular-nums text-sm"
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EditableRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/70 pb-4 last:border-b-0 last:pb-0">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="w-44">{children}</div>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="sm"
      onClick={onClick}
      className="w-full justify-center"
    >
      {children}
    </Button>
  );
}

function EmptyState({
  message,
  detail,
}: {
  message: string;
  detail?: string;
}) {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-xl border border-dashed border-border/70 px-6 py-10 text-center">
      <div className="space-y-1">
        <p className="text-sm font-medium">{message}</p>
        {detail ? <p className="text-sm text-muted-foreground">{detail}</p> : null}
      </div>
    </div>
  );
}

function MiniChart({ values }: { values: number[] }) {
  if (values.length < 2) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Not enough history yet
      </div>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * 100;
    const y = max === min ? 50 : 100 - ((value - min) / (max - min)) * 100;
    return `${x},${y}`;
  });

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="h-full w-full text-foreground"
    >
      <polyline
        fill="currentColor"
        fillOpacity="0.08"
        stroke="none"
        points={`0,100 ${points.join(" ")} 100,100`}
      />
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        points={points.join(" ")}
      />
    </svg>
  );
}

function RadioRow({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-4 text-left"
    >
      <span
        className={cn(
          "flex size-5 items-center justify-center rounded-full border",
          active ? "border-foreground" : "border-muted-foreground"
        )}
      >
        <span
          className={cn(
            "size-2 rounded-full",
            active ? "bg-foreground" : "bg-transparent"
          )}
        />
      </span>
      <span className={active ? "text-foreground" : "text-muted-foreground"}>
        {label}
      </span>
    </button>
  );
}

function BlurCommitInput({
  value: initialValue,
  onCommit,
  placeholder,
  inputMode,
}: {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  inputMode?: "decimal" | "numeric" | "text";
}) {
  return (
    <Input
      key={initialValue}
      defaultValue={initialValue}
      onBlur={(e) => {
        const nextValue = e.target.value.trim();
        if (nextValue !== initialValue) {
          onCommit(nextValue);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder={placeholder}
      inputMode={inputMode}
      className="h-9 text-sm"
    />
  );
}

function useBrokerageAnalytics(asset: Asset | null): BrokerageAnalytics {
  const from = useMemo(() => {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 1);
    return toDateString(date);
  }, []);
  const { data: transactions, isLoading: transactionsLoading } =
    useAssetTransactions(asset?.id ?? null);
  const { data: snapshots, isLoading: snapshotsLoading } = useAssetSnapshots(
    asset?.id ?? null,
    from
  );

  return useMemo(() => {
    const empty: BrokerageAnalytics = {
      isLoading: transactionsLoading || snapshotsLoading,
      transactions: [],
      snapshots: [],
      positionName: asset?.name ?? "Position",
      ticker: null,
      quantity: null,
      price: null,
      currentValue: asset ? Number(asset.currentValue) : 0,
      costBasis: asset?.costBasis != null ? Number(asset.costBasis) : null,
      costBasisSource: asset?.costBasis != null ? "manual" : "missing",
      ownedValue: asset ? getOwnedAssetValue(asset) : 0,
      ownedCostBasis: null,
      netContributions: 0,
      realizedOutflows: 0,
      unrealizedGain: null,
      unrealizedGainPct: null,
      estimatedTaxRate: getEstimatedTaxRate(asset?.taxStatus ?? null),
      estimatedTax: null,
      ownedEstimatedTax: null,
      irr: null,
      firstTrackedAt: asset ? asset.createdAt : null,
      lastActivityAt: asset ? asset.updatedAt : null,
      yearsHeld: 0,
      periodChange: null,
      periodChangePct: null,
      totalCommissions: 0,
      benchmarks: BENCHMARKS.map((benchmark) => ({
        label: benchmark.label,
        rate: benchmark.rate,
        value: null,
        delta: null,
        deltaPct: null,
      })),
    };

    if (!asset) return empty;

    const sortedTransactions = [...(transactions ?? [])].sort((a, b) =>
      a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)
    );
    const sortedSnapshots = [...(snapshots ?? [])].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    const quantity =
      asset.quantity !== null
        ? Number(asset.quantity)
        : deriveQuantityFromTransactions(sortedTransactions);
    const price =
      asset.currentPrice !== null
        ? Number(asset.currentPrice)
        : quantity && quantity > 0
          ? Number(asset.currentValue) / quantity
          : null;
    const netContributions = sortedTransactions.reduce(
      (sum, tx) => sum + getContributionAmount(tx),
      0
    );
    const totalCommissions = sortedTransactions.reduce(
      (sum, tx) => sum + getCommissionAmount(tx),
      0
    );
    const realizedOutflows = sortedTransactions.reduce(
      (sum, tx) =>
        sum +
        (tx.type === "sell" || tx.type === "withdraw"
          ? Math.abs(getContributionAmount(tx))
          : 0),
      0
    );
    const manualCostBasis = asset.costBasis !== null ? Number(asset.costBasis) : null;
    const derivedCostBasis = netContributions > 0 ? netContributions : null;
    const costBasis = manualCostBasis ?? derivedCostBasis;
    const costBasisSource = manualCostBasis !== null
      ? "manual"
      : derivedCostBasis !== null
        ? "derived"
        : "missing";
    const currentValue = Number(asset.currentValue);
    const ownedValue = getOwnedAssetValue(asset);
    const ownershipFactor = Number(asset.ownershipPct ?? 100) / 100;
    const unrealizedGain =
      costBasis !== null ? currentValue - costBasis : null;
    const unrealizedGainPct =
      unrealizedGain !== null && costBasis && costBasis !== 0
        ? unrealizedGain / costBasis
        : null;
    const estimatedTaxRate = getEstimatedTaxRate(asset.taxStatus ?? null);
    const estimatedTax =
      unrealizedGain !== null && unrealizedGain > 0
        ? unrealizedGain * estimatedTaxRate
        : 0;
    const firstTrackedAt =
      sortedTransactions[0]?.date ??
      sortedSnapshots[0]?.date ??
      asset.createdAt;
    const lastActivityAt =
      sortedTransactions.at(-1)?.date ??
      sortedSnapshots.at(-1)?.date ??
      asset.updatedAt;
    const yearsHeld =
      firstTrackedAt ? yearDiff(firstTrackedAt, new Date()) : 0;
    const irr = estimateIrr(
      sortedTransactions,
      currentValue,
      costBasis,
      firstTrackedAt
    );
    const periodStartValue =
      sortedSnapshots.length > 0 ? Number(sortedSnapshots[0].value) : null;
    const periodChange =
      periodStartValue !== null ? currentValue - periodStartValue : null;
    const periodChangePct =
      periodStartValue && periodStartValue !== 0 && periodChange !== null
        ? periodChange / periodStartValue
        : null;
    const benchmarkBase = costBasis ?? (currentValue > 0 ? currentValue : null);
    const benchmarks = BENCHMARKS.map((benchmark) => {
      const value = calculateBenchmarkValue(
        benchmark.rate,
        sortedTransactions,
        benchmarkBase,
        firstTrackedAt
      );
      return {
        label: benchmark.label,
        rate: benchmark.rate,
        value,
        delta: value !== null ? currentValue - value : null,
        deltaPct:
          value !== null && value !== 0 ? (currentValue - value) / value : null,
      };
    });

    return {
      isLoading: transactionsLoading || snapshotsLoading,
      transactions: [...sortedTransactions].reverse(),
      snapshots: [...sortedSnapshots].reverse(),
      positionName: asset.name,
      ticker: getString(asset.providerConfig?.ticker),
      quantity,
      price,
      currentValue,
      costBasis,
      costBasisSource,
      ownedValue,
      ownedCostBasis: costBasis !== null ? costBasis * ownershipFactor : null,
      netContributions,
      realizedOutflows,
      unrealizedGain,
      unrealizedGainPct,
      estimatedTaxRate,
      estimatedTax,
      ownedEstimatedTax: estimatedTax !== null ? estimatedTax * ownershipFactor : null,
      irr,
      firstTrackedAt,
      lastActivityAt,
      yearsHeld,
      periodChange,
      periodChangePct,
      totalCommissions,
      benchmarks,
    };
  }, [asset, snapshots, snapshotsLoading, transactions, transactionsLoading]);
}

const DETAIL_KIND_LABELS: Record<DetailKind, string> = {
  asset: "Asset account",
  brokerage: "Brokerage account",
  cash: "Cash account",
  debt: "Debt account",
};

const TRANSACTION_TYPE_LABELS: Record<Transaction["type"], string> = {
  buy: "Buy",
  sell: "Sell",
  deposit: "Deposit",
  withdraw: "Withdraw",
};

function getProviderLabel(providerType: string) {
  switch (providerType) {
    case "plaid":
      return "Plaid synced";
    case "ticker":
      return "Ticker tracked";
    case "manual":
      return "Manual";
    default:
      return providerType;
  }
}

function getContributionAmount(tx: Transaction) {
  const total = Number(tx.total);
  const commission = getCommissionAmount(tx);
  return tx.type === "buy" || tx.type === "deposit"
    ? total + commission
    : -(total - commission);
}

function getCommissionAmount(tx: Transaction) {
  return toNumberOrNull(tx.commission) ?? 0;
}

function deriveQuantityFromTransactions(transactions: Transaction[]) {
  let hasQuantity = false;
  const total = transactions.reduce((sum, tx) => {
    const quantity = toNumberOrNull(tx.quantity);
    if (quantity === null) return sum;
    hasQuantity = true;
    return tx.type === "buy" || tx.type === "deposit"
      ? sum + quantity
      : sum - quantity;
  }, 0);
  return hasQuantity ? total : null;
}

function calculateBenchmarkValue(
  rate: number,
  transactions: Transaction[],
  fallbackAmount: number | null,
  fallbackDate: string | null
) {
  const today = new Date();

  if (transactions.length > 0) {
    const value = transactions.reduce((sum, tx) => {
      const years = yearDiff(tx.date, today);
      const compounded = Math.abs(getContributionAmount(tx)) * Math.pow(1 + rate, years);
      return getContributionAmount(tx) >= 0 ? sum + compounded : sum - compounded;
    }, 0);
    return value > 0 ? value : 0;
  }

  if (!fallbackAmount || !fallbackDate) return null;
  return fallbackAmount * Math.pow(1 + rate, yearDiff(fallbackDate, today));
}

function estimateIrr(
  transactions: Transaction[],
  currentValue: number,
  fallbackBasis: number | null,
  fallbackDate: string | null
) {
  const cashflows = transactions.map((tx) => ({
    amount: -getContributionAmount(tx),
    date: toDate(tx.date),
  }));

  if (cashflows.length === 0 && fallbackBasis && fallbackDate) {
    cashflows.push({ amount: -fallbackBasis, date: toDate(fallbackDate) });
  }

  if (cashflows.length === 0 || currentValue <= 0) return null;

  cashflows.push({ amount: currentValue, date: new Date() });

  const hasNegative = cashflows.some((flow) => flow.amount < 0);
  const hasPositive = cashflows.some((flow) => flow.amount > 0);
  if (!hasNegative || !hasPositive) return null;

  return xirr(cashflows);
}

function xirr(cashflows: { amount: number; date: Date }[]) {
  const normalized = [...cashflows].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
  const firstDate = normalized[0]?.date.getTime();
  if (!firstDate) return null;

  const npv = (rate: number) =>
    normalized.reduce((sum, flow) => {
      const years = (flow.date.getTime() - firstDate) / 31_557_600_000;
      return sum + flow.amount / Math.pow(1 + rate, years);
    }, 0);

  const derivative = (rate: number) =>
    normalized.reduce((sum, flow) => {
      const years = (flow.date.getTime() - firstDate) / 31_557_600_000;
      if (years === 0) return sum;
      return (
        sum -
        (years * flow.amount) / Math.pow(1 + rate, years + 1)
      );
    }, 0);

  let rate = 0.1;
  for (let index = 0; index < 20; index += 1) {
    const value = npv(rate);
    if (Math.abs(value) < 1e-6) return rate;
    const slope = derivative(rate);
    if (!Number.isFinite(slope) || slope === 0) break;
    const next = rate - value / slope;
    if (!Number.isFinite(next) || next <= -0.9999) break;
    rate = next;
  }

  let low = -0.9999;
  let high = 10;
  let lowValue = npv(low);
  let highValue = npv(high);

  while (lowValue * highValue > 0 && high < 1_000) {
    high *= 2;
    highValue = npv(high);
  }

  if (lowValue * highValue > 0) return null;

  for (let index = 0; index < 80; index += 1) {
    const mid = (low + high) / 2;
    const midValue = npv(mid);
    if (Math.abs(midValue) < 1e-6) return mid;
    if (lowValue * midValue <= 0) {
      high = mid;
      highValue = midValue;
    } else {
      low = mid;
      lowValue = midValue;
    }
  }

  return (low + high) / 2;
}

function getEstimatedTaxRate(taxStatus: Asset["taxStatus"]) {
  switch (taxStatus) {
    case "tax_free":
      return 0;
    case "tax_deferred":
      return 0.24;
    case "taxable":
    default:
      return 0.15;
  }
}

function renderMoneyValue(value: number | null, currency: string) {
  if (value === null || !Number.isFinite(value)) return "—";
  return <MoneyDisplay amount={value} currency={currency} />;
}

function renderSignedMoneyValue(value: number | null, currency: string) {
  if (value === null || !Number.isFinite(value)) return "—";
  const prefix = value > 0 ? "+" : value < 0 ? "-" : "";
  return (
    <span
      className={cn(
        value > 0 && "text-emerald-600",
        value < 0 && "text-red-600"
      )}
    >
      {prefix}
      <MoneyDisplay amount={Math.abs(value)} currency={currency} />
    </span>
  );
}

function formatPercent(
  value: number | null,
  options: { digits?: number } = {}
) {
  if (value === null || !Number.isFinite(value)) return "—";
  const digits = options.digits ?? 2;
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(digits)}%`;
}

function formatQuantity(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 8,
  });
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function formatShortDate(value: string) {
  return toDate(value).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function formatShortDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatSnapshotDate(date: string) {
  const snapshotDate = toDate(date);
  const today = new Date();
  if (snapshotDate.toDateString() === today.toDateString()) {
    return "Today";
  }
  return formatShortDate(date);
}

function formatTaxStatus(value: NonNullable<Asset["taxStatus"]>) {
  switch (value) {
    case "tax_deferred":
      return "Tax deferred";
    case "tax_free":
      return "Tax free";
    case "taxable":
    default:
      return "Taxable";
  }
}

function yearDiff(value: string, endDate: Date) {
  return Math.max(
    (endDate.getTime() - toDate(value).getTime()) / 31_557_600_000,
    0
  );
}

function toDate(value: string) {
  return value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00`);
}

function toDateString(date: Date) {
  return date.toISOString().split("T")[0];
}

function toNumberOrNull(value: string | null) {
  if (value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}
