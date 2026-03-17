"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { usePortfolios } from "@/hooks/use-portfolio";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  const { data: portfolioList, isLoading } = usePortfolios();
  const router = useRouter();
  const [onboarding, setOnboarding] = useState(false);

  useEffect(() => {
    if (isLoading || onboarding) return;
    if (portfolioList && portfolioList.length === 0) {
      setOnboarding(true);
      fetch("/api/portfolios/onboard", { method: "POST" })
        .then((res) => res.json())
        .then((data) => {
          if (data.portfolioId) {
            router.push(`/portfolio/${data.portfolioId}`);
          }
        })
        .catch(() => setOnboarding(false));
    }
  }, [portfolioList, isLoading, onboarding, router]);

  if (isLoading || onboarding) {
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
        <Button asChild>
          <Link href="/portfolio/new">
            <PlusIcon className="size-4 mr-1" />
            Create Portfolio
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Portfolios</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {portfolioList.map((p) => (
          <Link
            key={p.id}
            href={`/portfolio/${p.id}`}
            className="group rounded-xl border bg-card p-6 transition-colors hover:bg-accent/50"
          >
            <h2 className="font-semibold group-hover:underline">{p.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{p.currency}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
