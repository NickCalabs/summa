import { NextRequest, NextResponse } from "next/server";

const publicPaths = ["/login", "/register", "/api/auth", "/api/health", "/api/plaid/webhook"];

const RATE_LIMITED_PATHS = ["/api/auth/sign-in", "/api/auth/sign-up"];
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.ip ?? "unknown";
}

function cleanExpiredEntries() {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Apply rate limiting to auth endpoints
  if (RATE_LIMITED_PATHS.some((p) => pathname.startsWith(p))) {
    const ip = getClientIp(request);
    const now = Date.now();

    cleanExpiredEntries();

    const entry = rateLimitStore.get(ip);

    if (entry && now < entry.resetAt) {
      if (entry.count >= MAX_ATTEMPTS) {
        const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
        return new NextResponse("Too Many Requests", {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSeconds),
          },
        });
      }
      entry.count += 1;
    } else {
      rateLimitStore.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    }
  }

  // Allow public paths
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check for session cookie
  const sessionToken = request.cookies.get("better-auth.session_token");

  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
