/**
 * POST /api/daily-demands/reserve — Create a reservation
 *
 * Body: { itemId: string, quantity: number }
 * Returns: { success: true, reservation } or { error }
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/user-auth";
import { createReservation } from "@/services/dailyNeedsService";

export async function POST(req: NextRequest) {
    const uid = await getAuthenticatedUser(req);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const body = await req.json();
        const { itemId, quantity } = body;

        if (!itemId || !quantity) {
            return NextResponse.json(
                { error: "itemId and quantity are required" },
                { status: 400 }
            );
        }
        if (typeof quantity !== "number" || quantity < 1 || quantity > 100) {
            return NextResponse.json(
                { error: "Quantity must be 1–100" },
                { status: 400 }
            );
        }

        const result = await createReservation(uid, itemId, quantity);

        if ("error" in result) {
            return NextResponse.json({ error: result.error }, { status: result.code });
        }

        return NextResponse.json({ success: true, reservation: result.reservation });
    } catch (err) {
        console.error("[Reserve] Error:", err);
        return NextResponse.json({ error: "Failed to create reservation" }, { status: 500 });
    }
}
