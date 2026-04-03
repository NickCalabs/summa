import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { TtlCache } from "@/lib/providers/rate-limit-cache";

const MAX_CHECKS = 5;
const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const checkUserRateLimit = new TtlCache<{ count: number }>(500);

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";

  const limit = checkUserRateLimit.get(ip);

  if (limit) {
    if (limit.count >= MAX_CHECKS) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    limit.count++;
    checkUserRateLimit.set(ip, limit, WINDOW_MS);
  } else {
    checkUserRateLimit.set(ip, { count: 1 }, WINDOW_MS);
  }

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(user);
  const exists = Number(result[0].count) > 0;
  return NextResponse.json({ exists });
}
