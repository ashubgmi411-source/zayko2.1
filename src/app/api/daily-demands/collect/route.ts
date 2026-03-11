/**
 * POST /api/daily-demands/collect — Mark reservation as collected
 *
 * Body: { reservationId: string }
 * Returns: { success: true } or { error }
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/user-auth";
import { markCollected } from "@/services/dailyNeedsService";

export async function POST(req: NextRequest) {
    const uid = await getAuthenticatedUser(req);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const body = await req.json();
        const { reservationId } = body;

        if (!reservationId) {
            return NextResponse.json(
                { error: "reservationId is required" },
                { status: 400 }
            );
        }

        const result = await markCollected(reservationId, uid);

        if ("error" in result) {
            return NextResponse.json({ error: result.error }, { status: result.code });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("[Collect] Error:", err);
        return NextResponse.json({ error: "Failed to mark collected" }, { status: 500 });
    }
}
