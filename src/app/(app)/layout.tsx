"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronRightIcon,
  LandmarkIcon,
  LayoutGridIcon,
  MenuIcon,
  WalletCardsIcon,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { usePortfolio, usePortfolios } from "@/hooks/use-portfolio";
import { ThemeToggle } from "@/components/theme-toggle";
import { MoneyDisplay } from "@/components/portfolio/money-display";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ConnectionBanner } from "@/components/connection-banner";

function SettingsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function LogOutIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </svg>
  );
}

function VersionBadge() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION;
  const sha = process.env.NEXT_PUBLIC_GIT_SHA;
  return (
    <p className="px-2 text-[10px] text-white/25 font-mono leading-none" title={`Build: ${sha}`}>
      v{version} · {sha}
    </p>
  );
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGridIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

function parsePortfolioId(pathname: string): string | null {
  const match = pathname.match(/^\/portfolio\/([^/?]+)/);
  return match?.[1] ?? null;
}

function SidebarContent({
  pathname,
  activeSheetId,
  portfoliosLoading,
  portfolioList,
  activePortfolio,
  onNavigate,
}: {
  pathname: string;
  activeSheetId: string | null;
  portfoliosLoading: boolean;
  portfolioList: { id: string; name: string }[] | undefined;
  activePortfolio?:
    | {
        id: string;
        name: string;
        currency: string;
        aggregates: { totalAssets: number; totalDebts: number; netWorth: number };
        sheets: { id: string; name: string; type: "assets" | "debts" }[];
      }
    | undefined;
  onNavigate?: () => void;
}) {
  const assetSheets = activePortfolio?.sheets.filter((sheet) => sheet.type === "assets") ?? [];
  const debtSheets = activePortfolio?.sheets.filter((sheet) => sheet.type === "debts") ?? [];
  const firstAssetSheetId = assetSheets[0]?.id;
  const firstDebtSheetId = debtSheets[0]?.id;

  return (
    <>
      <div className="p-5 space-y-1">
        <h1 className="text-xl font-bold tracking-tight">Summa</h1>
        <p className="text-xs text-white/45">The balance sheet you actually own.</p>
      </div>

      <Separator className="bg-white/10" />

      <div className="flex-1 overflow-y-auto p-3">
        {/* Summary nav — Kubera-style totals */}
        {activePortfolio && (
          <>
            <nav className="space-y-0.5">
              <Link
                href="/dashboard"
                onClick={onNavigate}
                className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-colors ${
                  pathname === "/dashboard"
                    ? "bg-white text-[#1E1E2E]"
                    : "text-white/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className="flex items-center gap-3">
                  <LayoutGridIcon className="size-4" />
                  Net Worth
                </span>
                <MoneyDisplay
                  amount={activePortfolio.aggregates.netWorth}
                  currency={activePortfolio.currency}
                  className="text-sm tabular-nums"
                />
              </Link>

              <Link
                href={
                  firstAssetSheetId
                    ? `/portfolio/${activePortfolio.id}?sheet=${firstAssetSheetId}`
                    : `/portfolio/${activePortfolio.id}`
                }
                onClick={onNavigate}
                className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-colors ${
                  pathname.startsWith(`/portfolio/${activePortfolio.id}`) &&
                  activeSheetId &&
                  assetSheets.some((s) => s.id === activeSheetId)
                    ? "bg-white text-[#1E1E2E]"
                    : "text-white/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className="flex items-center gap-3">
                  <WalletCardsIcon className="size-4" />
                  Assets
                </span>
                <MoneyDisplay
                  amount={activePortfolio.aggregates.totalAssets}
                  currency={activePortfolio.currency}
                  className="text-sm tabular-nums"
                />
              </Link>

              <Link
                href={
                  firstDebtSheetId
                    ? `/portfolio/${activePortfolio.id}?sheet=${firstDebtSheetId}`
                    : `/portfolio/${activePortfolio.id}`
                }
                onClick={onNavigate}
                className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-colors ${
                  pathname.startsWith(`/portfolio/${activePortfolio.id}`) &&
                  activeSheetId &&
                  debtSheets.some((s) => s.id === activeSheetId)
                    ? "bg-white text-[#1E1E2E]"
                    : "text-white/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className="flex items-center gap-3">
                  <LandmarkIcon className="size-4" />
                  Debts
                </span>
                <MoneyDisplay
                  amount={activePortfolio.aggregates.totalDebts}
                  currency={activePortfolio.currency}
                  className="text-sm tabular-nums"
                />
              </Link>
            </nav>

            <Separator className="my-4 bg-white/10" />
          </>
        )}

        {/* Settings */}
        <nav className="space-y-1">
          <Link
            href="/settings"
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
              pathname === "/settings"
                ? "bg-white text-[#1E1E2E]"
                : "text-white/70 hover:bg-white/5 hover:text-white"
            }`}
          >
            <SettingsIcon className="size-4" />
            Settings
          </Link>
        </nav>

        {!activePortfolio && (
          <>
            <Separator className="my-4 bg-white/10" />
            <nav className="space-y-1">
              <Link
                href="/dashboard"
                onClick={onNavigate}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                  pathname === "/dashboard"
                    ? "bg-white text-[#1E1E2E]"
                    : "text-white/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                <LayoutGridIcon className="size-4" />
                Dashboard
              </Link>
            </nav>
          </>
        )}

        <Separator className="my-4 bg-white/10" />

        <div className="space-y-4">
          <div>
            <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-white/35">
              Portfolio
            </p>
            <div className="mt-1 space-y-1">
              {portfoliosLoading ? (
                <>
                  <Skeleton className="h-9 w-full bg-white/5" />
                  <Skeleton className="h-9 w-full bg-white/5" />
                </>
              ) : (
                portfolioList?.map((p) => {
                  const isActive = pathname.startsWith(`/portfolio/${p.id}`);
                  return (
                    <Link
                      key={p.id}
                      href={`/portfolio/${p.id}`}
                      onClick={onNavigate}
                      className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-colors ${
                        isActive
                          ? "bg-white/10 text-white"
                          : "text-white/65 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <span className="truncate">{p.name}</span>
                      <ChevronRightIcon className="size-4 shrink-0 text-white/30" />
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          {activePortfolio && assetSheets.length > 1 && (
            <div>
              <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-white/35">
                Asset Sheets
              </p>
              <div className="mt-1 space-y-1">
                {assetSheets.map((sheet) => (
                  <Link
                    key={sheet.id}
                    href={`/portfolio/${activePortfolio.id}?sheet=${sheet.id}`}
                    onClick={onNavigate}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                      pathname.startsWith(`/portfolio/${activePortfolio.id}`) &&
                      activeSheetId === sheet.id
                        ? "bg-white/10 text-white"
                        : "text-white/70 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <WalletCardsIcon className="size-4 shrink-0 text-white/45" />
                    <span className="truncate">{sheet.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {activePortfolio && debtSheets.length > 1 && (
            <div>
              <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-white/35">
                Debt Sheets
              </p>
              <div className="mt-1 space-y-1">
                {debtSheets.map((sheet) => (
                  <Link
                    key={sheet.id}
                    href={`/portfolio/${activePortfolio.id}?sheet=${sheet.id}`}
                    onClick={onNavigate}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                      pathname.startsWith(`/portfolio/${activePortfolio.id}`) &&
                      activeSheetId === sheet.id
                        ? "bg-white/10 text-white"
                        : "text-white/70 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <LandmarkIcon className="size-4 shrink-0 text-white/45" />
                    <span className="truncate">{sheet.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: portfolioList, isLoading: portfoliosLoading } = usePortfolios();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const activePortfolioId = useMemo(
    () => parsePortfolioId(pathname) ?? portfolioList?.[0]?.id ?? "",
    [pathname, portfolioList]
  );
  const { data: activePortfolio } = usePortfolio(activePortfolioId);
  const activeSheetId = searchParams.get("sheet");

  async function handleLogout() {
    await authClient.signOut();
    router.push("/login");
  }

  return (
    <div className="flex h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 flex-col bg-[#1E1E2E] text-white">
        <SidebarContent
          pathname={pathname}
          activeSheetId={activeSheetId}
          portfoliosLoading={portfoliosLoading}
          portfolioList={portfolioList}
          activePortfolio={
            activePortfolio
              ? {
                  id: activePortfolio.id,
                  name: activePortfolio.name,
                  currency: activePortfolio.currency,
                  aggregates: activePortfolio.aggregates,
                  sheets: activePortfolio.sheets.map((sheet) => ({
                    id: sheet.id,
                    name: sheet.name,
                    type: sheet.type,
                  })),
                }
              : undefined
          }
        />
        <Separator className="bg-white/10" />
        <div className="px-3 pt-2 pb-0">
          <VersionBadge />
        </div>
        <div className="p-3 flex items-center justify-between">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/5"
            onClick={handleLogout}
          >
            <LogOutIcon />
            <span className="sr-only">Sign out</span>
          </Button>
        </div>
      </aside>

      {/* Mobile sidebar drawer */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent
          side="left"
          className="w-60 p-0 bg-[#1E1E2E] text-white border-none"
          showCloseButton={false}
        >
          <SidebarContent
            pathname={pathname}
            activeSheetId={activeSheetId}
            portfoliosLoading={portfoliosLoading}
            portfolioList={portfolioList}
            activePortfolio={
              activePortfolio
                ? {
                    id: activePortfolio.id,
                    name: activePortfolio.name,
                    currency: activePortfolio.currency,
                    aggregates: activePortfolio.aggregates,
                    sheets: activePortfolio.sheets.map((sheet) => ({
                      id: sheet.id,
                      name: sheet.name,
                      type: sheet.type,
                    })),
                  }
                : undefined
            }
            onNavigate={() => setSidebarOpen(false)}
          />
          <Separator className="bg-white/10" />
          <div className="px-3 pt-2 pb-0">
            <VersionBadge />
          </div>
          <div className="p-3 flex items-center justify-between">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/5"
              onClick={handleLogout}
            >
              <LogOutIcon />
              <span className="sr-only">Sign out</span>
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <div className="flex md:hidden items-center gap-3 px-4 py-3 border-b bg-background">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setSidebarOpen(true)}
          >
            <MenuIcon className="size-5" />
            <span className="sr-only">Open menu</span>
          </Button>
          <span className="font-bold">Summa</span>
        </div>

        <ConnectionBanner />
        <main className="flex-1 overflow-y-auto bg-background">{children}</main>
      </div>
    </div>
  );
}
