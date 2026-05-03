"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { RecapReportType, RecapPeriod, RecapMode } from "@/lib/recap-types";

interface RecapContextValue {
  report: RecapReportType;
  setReport: (r: RecapReportType) => void;
  period: RecapPeriod;
  setPeriod: (p: RecapPeriod) => void;
  mode: RecapMode;
  setMode: (m: RecapMode) => void;
  showChange: boolean;
  toggleShowChange: () => void;
  drillDownKey: string | null;
  drillDownAssetIds: string[];
  drillDownLabel: string;
  openDrillDown: (key: string, assetIds: string[], label: string) => void;
  closeDrillDown: () => void;
}

const Ctx = createContext<RecapContextValue | null>(null);

const VALID_REPORTS = new Set<string>([
  "net_worth",
  "sheets_sections",
  "assets_by_class",
  "investable",
  "cash_on_hand",
  "crypto",
  "brokerages",
  "assets_by_tax",
]);

const VALID_PERIODS = new Set<string>([
  "today",
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
]);

export function RecapProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const reportParam = searchParams.get("report");
  const periodParam = searchParams.get("period");
  const modeParam = searchParams.get("mode");

  const report: RecapReportType = VALID_REPORTS.has(reportParam ?? "")
    ? (reportParam as RecapReportType)
    : "net_worth";
  const period: RecapPeriod = VALID_PERIODS.has(periodParam ?? "")
    ? (periodParam as RecapPeriod)
    : "monthly";
  const mode: RecapMode =
    modeParam === "allocation" ? "allocation" : "totals";

  const [showChange, setShowChange] = useState(false);
  const [drillDown, setDrillDown] = useState<{
    key: string;
    assetIds: string[];
    label: string;
  } | null>(null);

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        params.set(k, v);
      }
      router.replace(`${pathname}?${params.toString()}`);
    },
    [searchParams, router, pathname]
  );

  const setReport = useCallback(
    (r: RecapReportType) => updateParams({ report: r }),
    [updateParams]
  );
  const setPeriod = useCallback(
    (p: RecapPeriod) => updateParams({ period: p }),
    [updateParams]
  );
  const setMode = useCallback(
    (m: RecapMode) => updateParams({ mode: m }),
    [updateParams]
  );
  const toggleShowChange = useCallback(
    () => setShowChange((v) => !v),
    []
  );

  const openDrillDown = useCallback(
    (key: string, assetIds: string[], label: string) =>
      setDrillDown({ key, assetIds, label }),
    []
  );
  const closeDrillDown = useCallback(() => setDrillDown(null), []);

  const value = useMemo<RecapContextValue>(
    () => ({
      report,
      setReport,
      period,
      setPeriod,
      mode,
      setMode,
      showChange,
      toggleShowChange,
      drillDownKey: drillDown?.key ?? null,
      drillDownAssetIds: drillDown?.assetIds ?? [],
      drillDownLabel: drillDown?.label ?? "",
      openDrillDown,
      closeDrillDown,
    }),
    [
      report,
      setReport,
      period,
      setPeriod,
      mode,
      setMode,
      showChange,
      toggleShowChange,
      drillDown,
      openDrillDown,
      closeDrillDown,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRecapContext() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRecapContext must be used within RecapProvider");
  return ctx;
}
