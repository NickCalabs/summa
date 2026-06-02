"use client";

import { Button } from "@/components/ui/button";
import { CheckCircle2Icon } from "lucide-react";
import Link from "next/link";

interface Props {
  count: number;
  sourceName: string;
  logId: string;
  onClose: () => void;
}

export function SuccessStep({ count, sourceName, logId, onClose }: Props) {
  return (
    <div className="py-8 text-center space-y-4">
      <CheckCircle2Icon className="size-12 mx-auto text-green-600" />
      <div>
        <p className="text-base font-semibold">Import complete</p>
        <p className="text-sm text-muted-foreground mt-1">
          Updated {count} asset{count === 1 ? "" : "s"} from {sourceName}
        </p>
      </div>
      <div className="flex justify-center gap-2">
        <Button
          variant="outline"
          render={<Link href={`/settings/imports/${logId}`}>View import log</Link>}
        />
        <Button onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}
