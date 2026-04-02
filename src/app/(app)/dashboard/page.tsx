"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { usePortfolios } from "@/hooks/use-portfolio";
import { authClient } from "@/lib/auth-client";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export default function DashboardPage() {
  const { data: portfolioList, isLoading } = usePortfolios();
  const session = authClient.useSession();
  const router = useRouter();
  const [isOnboarding, setIsOnboarding] = useState(false);

  useEffect(() => {
    const shouldOnboard =
      !isLoading &&
      portfolioList &&
      portfolioList.length === 0 &&
      !isOnboarding;

    if (!shouldOnboard) return;

    Promise.resolve().then(() => setIsOnboarding(true));
    fetch("/api/portfolios/onboard", { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        if (data.portfolioId) {
          router.push(`/portfolio/${data.portfolioId}`);
          return;
        }
        setIsOnboarding(false);
      })
      .catch(() => {
        setIsOnboarding(false);
      });
  }, [isLoading, portfolioList, isOnboarding, router]);

  if (isLoading || isOnboarding) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!portfolioList || portfolioList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-muted-foreground">Create your first portfolio to get started.</p>
        <Link href="/portfolio/new" className={buttonVariants()}>
          <PlusIcon className="size-4 mr-1" />
          Create Portfolio
        </Link>
      </div>
    );
  }

  const primaryPortfolio = portfolioList[0];
  const userName = session.data?.user?.name?.split(" ")[0] ?? "there";

  return <DashboardView portfolioId={primaryPortfolio.id} userName={userName} />;
}
