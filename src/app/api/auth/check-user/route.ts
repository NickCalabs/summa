import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export async function GET() {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(user);
  const exists = Number(result[0].count) > 0;
  return NextResponse.json({ exists });
}
