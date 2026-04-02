"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyDisplay } from "@/components/portfolio/money-display";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useUpdateAsset } from "@/hooks/use-assets";
import { useAssetSnapshots } from "@/hooks/use-snapshots";
import { findAssetLocation } from "@/lib/portfolio-utils";
import { parseCurrencyInput } from "@/lib/currency";

interface AccountDetailViewProps {
  portfolioId: string;
  assetId: string;
}

export function AccountDetailView({
  portfolioId,
  assetId,
}: AccountDetailViewProps) {
  const { data: portfolio, isLoading, error } = usePortfolio(portfolioId);
  const assetLocation = useMemo(
    () => (portfolio ? findAssetLocation(portfolio, assetId) : null),
    [portfolio, assetId]
  );

  if (isLoading) {
    return (
      <div className="p-6 md:p-8 space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-16 w-56" />
        <Skeleton className="h-[320px] w-full" />
      </div>
    );
  }

  if (error || !portfolio || !assetLocation) {
    return (
      <div className="p-6 md:p-8 space-y-4">
        <p className="text-lg font-medium">Account not found</p>
        <Link href={`/portfolio/${portfolioId}`}>
          <Button variant="outline" size="sm">
            <ArrowLeftIcon className="size-4" data-icon="inline-start" />
            Back to portfolio
          </Button>
        </Link>
      </div>
    );
  }

  const { asset, sheet, section } = assetLocation;
  const isDebt = sheet.type === "debts";
  const defaultTab = isDebt ? "debt" : "value";

  return (
    <div className="p-6 md:p-8 space-y-8">
      <Link href={`/portfolio/${portfolioId}?sheet=${sheet.id}`}>
        <Button variant="ghost" size="sm" className="px-0 text-muted-foreground">
          <ArrowLeftIcon className="size-4" data-icon="inline-start" />
          Back to {sheet.name}
        </Button>
      </Link>

      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          {asset.name}
        </h1>
        <MoneyDisplay
          amount={Number(asset.currentValue)}
          currency={asset.currency}
          className="text-5xl font-semibold tracking-tight md:text-6xl"
        />
        <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
          <span>{section.name}</span>
          <span>{sheet.type === "debts" ? "Debt account" : "Asset account"}</span>
          <span>Ownership {asset.ownershipPct}%</span>
        </div>
      </header>

      <Tabs defaultValue={defaultTab} className="gap-6">
        <TabsList variant="line" className="w-full justify-start gap-6 border-b pb-2">
          {isDebt ? (
            <>
              <TabsTrigger value="debt" className="flex-none px-0 text-lg">Debt</TabsTrigger>
              <TabsTrigger value="balance" className="flex-none px-0 text-lg">Balance</TabsTrigger>
              <TabsTrigger value="ownership" className="flex-none px-0 text-lg">Ownership</TabsTrigger>
              <TabsTrigger value="notes" className="flex-none px-0 text-lg">Notes</TabsTrigger>
            </>
          ) : (
            <>
              <TabsTrigger value="value" className="flex-none px-0 text-lg">Value</TabsTrigger>
              <TabsTrigger value="reporting" className="flex-none px-0 text-lg">Reporting</TabsTrigger>
              <TabsTrigger value="assorted" className="flex-none px-0 text-lg">Assorted</TabsTrigger>
              <TabsTrigger value="notes" className="flex-none px-0 text-lg">Notes</TabsTrigger>
            </>
          )}
        </TabsList>

        {isDebt ? (
          <>
            <TabsContent value="debt">
              <DebtTab portfolioId={portfolioId} asset={asset} />
            </TabsContent>
            <TabsContent value="balance">
              <HistoryTab assetId={asset.id} currency={asset.currency} />
            </TabsContent>
            <TabsContent value="ownership">
              <OwnershipTab portfolioId={portfolioId} asset={asset} />
            </TabsContent>
            <TabsContent value="notes">
              <NotesTab portfolioId={portfolioId} asset={asset} />
            </TabsContent>
          </>
        ) : (
          <>
            <TabsContent value="value">
              <ValueTab portfolioId={portfolioId} asset={asset} />
            </TabsContent>
            <TabsContent value="reporting">
              <ReportingTab portfolioId={portfolioId} asset={asset} />
            </TabsContent>
            <TabsContent value="assorted">
              <OwnershipTab portfolioId={portfolioId} asset={asset} />
            </TabsContent>
            <TabsContent value="notes">
              <NotesTab portfolioId={portfolioId} asset={asset} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}

function ValueTab({
  portfolioId,
  asset,
}: {
  portfolioId: string;
  asset: NonNullable<ReturnType<typeof findAssetLocation>>["asset"];
}) {
  const updateAsset = useUpdateAsset(portfolioId);
  const [value, setValue] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseCurrencyInput(value, asset.currency);
    if (parsed.amount !== 0 || value.trim() === "0") {
      updateAsset.mutate({ id: asset.id, currentValue: String(parsed.amount) });
      setValue("");
    }
  }

  return (
    <div className="space-y-6">
      <HistoryTab assetId={asset.id} currency={asset.currency} />
      <form onSubmit={handleSubmit} className="flex max-w-xl gap-3">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Update value"
          inputMode="decimal"
        />
        <Button type="submit">Save</Button>
      </form>
    </div>
  );
}

function DebtTab({
  portfolioId,
  asset,
}: {
  portfolioId: string;
  asset: NonNullable<ReturnType<typeof findAssetLocation>>["asset"];
}) {
  const updateAsset = useUpdateAsset(portfolioId);
  const [balance, setBalance] = useState(String(Number(asset.currentValue)));

  return (
    <div className="max-w-4xl space-y-8">
      <div className="space-y-3">
        <p className="text-4xl leading-tight">There are 2 ways to use this generic debt.</p>
        <div className="space-y-2 text-xl text-muted-foreground">
          <p><span className="font-semibold text-foreground">1. Enter and update the balance manually</span></p>
          <p>Start by entering the debt&apos;s current balance. Update it manually over time, just like you would in a spreadsheet.</p>
        </div>
      </div>

      <Input
        value={balance}
        onChange={(e) => setBalance(e.target.value)}
        onBlur={() => {
          const parsed = parseCurrencyInput(balance, asset.currency);
          updateAsset.mutate({ id: asset.id, currentValue: String(parsed.amount) });
        }}
        className="h-20 text-3xl"
        inputMode="decimal"
      />

      <div className="rounded-md border">
        <RuleRow label="Apply interest rate 7% per year. Updated every month on day 1" />
        <RuleRow label="Reduce the balance by USD XXXX. Updated every month on day 1" />
      </div>
    </div>
  );
}

function ReportingTab({
  portfolioId,
  asset,
}: {
  portfolioId: string;
  asset: NonNullable<ReturnType<typeof findAssetLocation>>["asset"];
}) {
  const updateAsset = useUpdateAsset(portfolioId);

  return (
    <div className="max-w-3xl space-y-8">
      <div className="space-y-2">
        <h3 className="text-2xl font-medium">Investable Asset?</h3>
        <p className="text-muted-foreground">
          Investable assets are those held in cash or in forms that can be quickly liquidated.
        </p>
        <div className="space-y-3 pt-2">
          <RadioRow
            active={asset.isInvestable && asset.isCashEquivalent}
            label="Investable - Cash"
            onClick={() =>
              updateAsset.mutate({
                id: asset.id,
                isInvestable: true,
                isCashEquivalent: true,
              })
            }
          />
          <RadioRow
            active={!asset.isInvestable}
            label="Non Investable"
            onClick={() =>
              updateAsset.mutate({
                id: asset.id,
                isInvestable: false,
                isCashEquivalent: false,
              })
            }
          />
        </div>
      </div>
    </div>
  );
}

function OwnershipTab({
  portfolioId,
  asset,
}: {
  portfolioId: string;
  asset: NonNullable<ReturnType<typeof findAssetLocation>>["asset"];
}) {
  const updateAsset = useUpdateAsset(portfolioId);
  const [ownership, setOwnership] = useState(asset.ownershipPct ?? "100");

  return (
    <div className="max-w-4xl space-y-4">
      <h3 className="text-2xl font-medium">Ownership Percentage</h3>
      <p className="text-muted-foreground">
        Your share, if you co-own this account with someone.
      </p>
      <Input
        value={ownership}
        onChange={(e) => setOwnership(e.target.value)}
        onBlur={() => updateAsset.mutate({ id: asset.id, ownershipPct: ownership })}
        className="h-20 text-3xl"
        inputMode="decimal"
      />
    </div>
  );
}

function NotesTab({
  portfolioId,
  asset,
}: {
  portfolioId: string;
  asset: NonNullable<ReturnType<typeof findAssetLocation>>["asset"];
}) {
  const updateAsset = useUpdateAsset(portfolioId);
  const [notes, setNotes] = useState(asset.notes ?? "");

  return (
    <div className="max-w-4xl space-y-4">
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() =>
          updateAsset.mutate({ id: asset.id, notes: notes.trim() || null } as never)
        }
        className="min-h-[240px] text-lg"
        placeholder="Add notes about this account..."
      />
    </div>
  );
}

function HistoryTab({
  assetId,
  currency,
}: {
  assetId: string;
  currency: string;
}) {
  const from = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().split("T")[0];
  }, []);
  const { data: snapshots, isLoading } = useAssetSnapshots(assetId, from);
  const rows = useMemo(
    () => (snapshots ? [...snapshots] : []).sort((a, b) => b.date.localeCompare(a.date)),
    [snapshots]
  );

  return (
    <div className="space-y-6">
      <div className="h-48 rounded-md border bg-muted/10 p-4">
        {isLoading ? <Skeleton className="h-full w-full" /> : <MiniChart values={rows.map((row) => Number(row.value))} />}
      </div>
      <div className="overflow-hidden border">
        <table className="w-full text-left">
          <thead className="border-b text-sm uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4 text-right">Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((snapshot) => (
              <tr key={snapshot.id} className="border-b last:border-b-0">
                <td className="px-6 py-4 text-xl">{formatSnapshotDate(snapshot.date)}</td>
                <td className="px-6 py-4 text-right text-xl tabular-nums">
                  <MoneyDisplay amount={Number(snapshot.value)} currency={currency} />
                </td>
              </tr>
            ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={2} className="px-6 py-10 text-center text-muted-foreground">
                  No history yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MiniChart({ values }: { values: number[] }) {
  if (values.length < 2) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
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
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
      <polyline
        fill="rgba(139, 92, 246, 0.18)"
        stroke="none"
        points={`0,100 ${points.join(" ")} 100,100`}
      />
      <polyline
        fill="none"
        stroke="#7c3aed"
        strokeWidth="1.6"
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
    <button type="button" onClick={onClick} className="flex items-center gap-4 text-left text-2xl">
      <span className={`flex size-7 items-center justify-center rounded-full border ${active ? "border-foreground" : "border-muted-foreground"}`}>
        <span className={`size-3 rounded-full ${active ? "bg-foreground" : "bg-transparent"}`} />
      </span>
      <span className={active ? "text-foreground" : "text-muted-foreground"}>{label}</span>
    </button>
  );
}

function RuleRow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between border-b px-6 py-6 last:border-b-0">
      <span className="text-2xl text-muted-foreground">{label}</span>
      <div className="h-8 w-16 rounded-full bg-muted/80" />
    </div>
  );
}

function formatSnapshotDate(date: string) {
  const snapshotDate = new Date(`${date}T00:00:00`);
  const today = new Date();
  if (snapshotDate.toDateString() === today.toDateString()) {
    return "Today";
  }
  return snapshotDate.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
