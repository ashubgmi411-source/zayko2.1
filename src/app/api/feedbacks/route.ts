import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

// ─── POST /api/feedbacks (Submit Feedback) ────────────
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { orderId, userId, userName, rating, comment } = body;

        if (!orderId || !userId || !rating) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Verify order exists
        const orderSnap = await adminDb.collection("orders").doc(orderId).get();
        if (!orderSnap.exists) {
            return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }

        const feedbackData = {
            orderId,
            userId,
            userName: userName || "Anonymous",
            rating: Number(rating),
            comment: comment || "",
            createdAt: new Date().toISOString(),
        };

        const docRef = await adminDb.collection("feedbacks").add(feedbackData);

        return NextResponse.json({
            success: true,
            id: docRef.id
        }, { status: 201 });

    } catch (error: any) {
        console.error("[Feedback API] POST Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// ─── GET /api/feedbacks (Admin View All) ─────────────
export async function GET(req: NextRequest) {
    try {
        const authHeader = req.headers.get("authorization");
        if (!authHeader) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const snapshot = await adminDb
            .collection("feedbacks")
            .orderBy("createdAt", "desc")
            .get();

        const feedbacks = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        return NextResponse.json(feedbacks);
    } catch (error: any) {
        console.error("[Feedback API] GET Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
