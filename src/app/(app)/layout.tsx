"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MenuIcon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { usePortfolios } from "@/hooks/use-portfolio";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ConnectionBanner } from "@/components/connection-banner";

function LayoutIcon(props: React.SVGProps<SVGSVGElement>) {
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
      <rect width="7" height="9" x="3" y="3" rx="1" />
      <rect width="7" height="5" x="14" y="3" rx="1" />
      <rect width="7" height="9" x="14" y="12" rx="1" />
      <rect width="7" height="5" x="3" y="16" rx="1" />
    </svg>
  );
}

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
  { href: "/dashboard", label: "Dashboard", icon: LayoutIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

function SidebarContent({
  pathname,
  portfoliosLoading,
  portfolioList,
  onNavigate,
}: {
  pathname: string;
  portfoliosLoading: boolean;
  portfolioList: { id: string; name: string }[] | undefined;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="p-5">
        <h1 className="text-xl font-bold tracking-tight">Summa</h1>
      </div>

      <Separator className="bg-white/10" />

      {/* Portfolio list */}
      <div className="flex-1 overflow-y-auto p-3">
        <p className="px-2 py-1 text-xs font-medium uppercase tracking-wider text-white/40">
          Portfolios
        </p>
        <div className="mt-1 space-y-0.5">
          {portfoliosLoading ? (
            <>
              <Skeleton className="h-8 w-full bg-white/5" />
              <Skeleton className="h-8 w-full bg-white/5" />
            </>
          ) : (
            portfolioList?.map((p) => {
              const isActive = pathname === `/portfolio/${p.id}`;
              return (
                <Link
                  key={p.id}
                  href={`/portfolio/${p.id}`}
                  onClick={onNavigate}
                  className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-white/10 text-white"
                      : "text-white/70 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {p.name}
                </Link>
              );
            })
          )}
        </div>
      </div>

      <Separator className="bg-white/10" />

      {/* Navigation */}
      <nav className="p-3 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-white/10 text-white"
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              <item.icon />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: portfolioList, isLoading: portfoliosLoading } = usePortfolios();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
          portfoliosLoading={portfoliosLoading}
          portfolioList={portfolioList}
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
            portfoliosLoading={portfoliosLoading}
            portfolioList={portfolioList}
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
