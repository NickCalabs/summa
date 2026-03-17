import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

// Rate limit: 5 requests per 5 minutes per IP
const checkUserRateLimit = new Map<string, { count: number; resetAt: number }>();

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const now = Date.now();
  const windowMs = 5 * 60 * 1000; // 5 minutes
  const limit = checkUserRateLimit.get(ip);

  if (limit && now < limit.resetAt) {
    if (limit.count >= 5) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    limit.count++;
  } else {
    checkUserRateLimit.set(ip, { count: 1, resetAt: now + windowMs });
  }

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(user);
  const exists = Number(result[0].count) > 0;
  return NextResponse.json({ exists });
}
