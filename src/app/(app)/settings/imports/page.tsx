"use client";

import Link from "next/link";
import { useImportLogs } from "@/hooks/use-import";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";

export default function ImportHistoryPage() {
  const { data: logs, isLoading } = useImportLogs();

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <Link
          href="/settings"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to settings
        </Link>
        <h1 className="text-2xl font-bold tracking-tight mt-2">
          Import History
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Past document imports and the changes they applied.
        </p>
      </div>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Recent imports</CardTitle>
          <CardDescription>Up to 50 most recent imports.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : !logs || logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No imports yet. Use the toolbar Import Document option to get
              started.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Source</th>
                    <th className="py-2 pr-4 font-medium">File</th>
                    <th className="py-2 pr-4 font-medium">Assets</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b last:border-b-0 hover:bg-muted/40 cursor-pointer"
                    >
                      <td className="py-2 pr-4">
                        <Link
                          href={`/settings/imports/${log.id}`}
                          className="block"
                        >
                          {format(new Date(log.createdAt), "MMM d, yyyy")}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">
                        <Link
                          href={`/settings/imports/${log.id}`}
                          className="block"
                        >
                          {log.sourceName ?? "—"}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">
                        <Link
                          href={`/settings/imports/${log.id}`}
                          className="block"
                        >
                          {log.filename}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">
                        <Link
                          href={`/settings/imports/${log.id}`}
                          className="block"
                        >
                          {log.appliedChanges?.length ?? 0}
                        </Link>
                      </td>
                      <td className="py-2">
                        <Link
                          href={`/settings/imports/${log.id}`}
                          className="block"
                        >
                          <Badge
                            variant={
                              log.status === "success"
                                ? "default"
                                : log.status === "failed"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {log.status}
                          </Badge>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
