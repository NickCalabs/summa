"use client";

import { authClient } from "@/lib/auth-client";

export default function DashboardPage() {
  const { data: session } = authClient.useSession();

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold">
        {session?.user?.name
          ? `Welcome, ${session.user.name}`
          : "Dashboard"}
      </h1>
      <p className="mt-2 text-muted-foreground">
        Your net worth overview will appear here.
      </p>
    </div>
  );
}
