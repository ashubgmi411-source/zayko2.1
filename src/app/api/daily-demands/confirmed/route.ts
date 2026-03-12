/**
 * GET /api/daily-demands/confirmed — Confirmed demand for stock manager
 *
 * Returns only status="confirmed" reservations, aggregated by item.
 * This is the ONLY demand the stock manager should act on.
 *
 * Query params:
 *   ?date=YYYY-MM-DD (optional, defaults to today)
 *
 * Returns: { success: true, items: ConfirmedDemandItem[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { getConfirmedDemandForStockManager } from "@/services/dailyNeedsService";

export async function GET(req: NextRequest) {
    // Auth: stock manager token
    const authHeader = req.headers.get("authorization");
    const stockToken = authHeader?.replace("Bearer ", "");
    const expectedToken = process.env.STOCK_MANAGER_TOKEN;

    if (!expectedToken || stockToken !== expectedToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const date = req.nextUrl.searchParams.get("date") || undefined;
        const items = await getConfirmedDemandForStockManager(date);

        const totalQuantity = items.reduce((s, i) => s + i.totalQuantity, 0);

        return NextResponse.json({
            success: true,
            items,
            totalQuantity,
            itemCount: items.length,
        });
    } catch (err) {
        console.error("[ConfirmedDemand] Error:", err);
        return NextResponse.json(
            { error: "Failed to fetch confirmed demand" },
            { status: 500 }
        );
    }
}
