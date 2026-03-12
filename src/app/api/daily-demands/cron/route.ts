// /api/daily-demands/cron — Secure Cron Job Endpoint
//
// Called every 10 minutes by Railway Cron, Vercel Cron, or external scheduler.
// Protected by CRON_SECRET env var — rejects all unauthenticated requests.
//
// Accepts secret via:
//   1. x-cron-secret header (preferred — keeps secret out of URL logs)
//   2. ?secret= query parameter (Railway Cron compatibility)
//
// Tasks:
//   1. Expire unconfirmed reservations past midnight (12:00 AM cutoff)
//   2. Mark no-show for confirmed reservations past canteen close (2:00 PM)
//   3. Update user behavior records (reliability score, restrictions)
//
// Timing:
//   - Users reserve during the day
//   - Confirmation window: 10:00 PM → 12:00 AM (same night)
//   - Pickup window: 8:00 AM → 2:00 PM (next day)
//   - Cron runs every 10 minutes to process expired/no-show reservations
//
// Railway Cron Config:
//   Schedule: every 10 minutes
//   Endpoint: https://yourdomain.com/api/daily-demands/cron?secret=CRON_SECRET


import { NextRequest, NextResponse } from "next/server";
import { releaseExpiredReservations } from "@/services/dailyNeedsService";

// ─── Timing-safe comparison to prevent timing attacks ────
function secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let mismatch = 0;
    for (let i = 0; i < a.length; i++) {
        mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return mismatch === 0;
}

async function handleCron(req: NextRequest): Promise<NextResponse> {
    const startTime = Date.now();

    // 1. Verify CRON_SECRET exists in env
    const expectedSecret = process.env.CRON_SECRET;
    if (!expectedSecret) {
        console.error("[Cron] ❌ CRON_SECRET env var is not set");
        return NextResponse.json(
            { error: "Server misconfiguration" },
            { status: 500 }
        );
    }

    // 2. Extract secret from header (preferred) or query param
    const secret =
        req.headers.get("x-cron-secret") ||
        req.nextUrl.searchParams.get("secret") ||
        "";

    // 3. Timing-safe comparison
    if (!secret || !secureCompare(secret, expectedSecret)) {
        console.warn(`[Cron] ⛔ Unauthorized attempt from ${req.headers.get("x-forwarded-for") || "unknown"}`);
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    // 4. Execute cron tasks
    try {
        const result = await releaseExpiredReservations();
        const durationMs = Date.now() - startTime;

        console.log(
            `[Cron] ✅ Completed in ${durationMs}ms — ` +
            `${result.expiredCount} expired, ${result.noShowCount} no-shows`
        );

        return NextResponse.json({
            success: true,
            expiredCount: result.expiredCount,
            noShowCount: result.noShowCount,
            durationMs,
            timestamp: new Date().toISOString(),
        });
    } catch (err: unknown) {
        const durationMs = Date.now() - startTime;
        const errorMessage = err instanceof Error ? err.message : "Unknown error";

        console.error(`[Cron] ❌ Failed after ${durationMs}ms:`, errorMessage);

        // Never leak internal error details to the client
        return NextResponse.json(
            {
                error: "Cron job failed",
                timestamp: new Date().toISOString(),
            },
            { status: 500 }
        );
    }
}

// Support both POST and GET (Railway uses GET, some schedulers use POST)
export async function POST(req: NextRequest) {
    return handleCron(req);
}

export async function GET(req: NextRequest) {
    return handleCron(req);
}
