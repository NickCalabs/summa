import { NextRequest, NextResponse } from "next/server";
import { TtlCache } from "@/lib/providers/rate-limit-cache";

const publicPaths = ["/login", "/register", "/api/auth", "/api/health", "/api/plaid/webhook", "/api/ca"];

const RATE_LIMITED_PATHS = ["/api/auth/sign-in", "/api/auth/sign-up"];
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const rateLimitStore = new TtlCache<{ count: number }>(1000);

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return (request as NextRequest & { ip?: string }).ip ?? "unknown";
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Apply rate limiting to auth endpoints
  if (RATE_LIMITED_PATHS.some((p) => pathname.startsWith(p))) {
    const ip = getClientIp(request);
    const entry = rateLimitStore.get(ip);

    if (entry) {
      if (entry.count >= MAX_ATTEMPTS) {
        return new NextResponse("Too Many Requests", {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(WINDOW_MS / 1000)),
          },
        });
      }
      entry.count += 1;
      rateLimitStore.set(ip, entry, WINDOW_MS);
    } else {
      rateLimitStore.set(ip, { count: 1 }, WINDOW_MS);
    }
  }

  // Allow public paths
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check for session cookie. Better-auth automatically prefixes with __Secure-
  // when running on HTTPS, so we accept both forms.
  const sessionToken =
    request.cookies.get("better-auth.session_token") ||
    request.cookies.get("__Secure-better-auth.session_token");

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
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|sw\\.js\\.map|swe-worker-.*\\.js|manifest\\.json|icon-.*\\.png|icon\\.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
