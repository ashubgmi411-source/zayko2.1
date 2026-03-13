/**
 * executeScheduledOrders — Core logic for processing due scheduled orders.
 *
 * Extracted as a standalone function so it can be called from:
 *   1. The API route (GET /api/scheduled-order/execute)
 *   2. The cron job in instrumentation.ts (directly, no HTTP needed)
 */

import { adminDb } from "@/lib/firebase-admin";
import { generateOrderId } from "@/lib/orderIdUtils";
import { FieldValue } from "firebase-admin/firestore";
import { deductInventoryForOrder } from "@/services/inventoryService";

export interface ExecutionResult {
    scheduledOrderId: string;
    status: "completed" | "failed";
    orderId?: string;
    reason?: string;
}

export interface ExecutionSummary {
    success: boolean;
    processed: number;
    results: ExecutionResult[];
    message?: string;
}

export async function executeScheduledOrders(): Promise<ExecutionSummary> {
    const now = new Date();

    // Query only by status to avoid needing a Firestore composite index
    const snapshot = await adminDb
        .collection("scheduled_orders")
        .where("status", "==", "scheduled")
        .get();

    // Filter due orders in-memory
    const dueDocs = snapshot.docs.filter((doc) => {
        const scheduledDateTime = doc.data().scheduledDateTime;
        return scheduledDateTime && new Date(scheduledDateTime).getTime() <= now.getTime();
    });

    if (dueDocs.length === 0) {
        return { success: true, processed: 0, results: [], message: "No scheduled orders due" };
    }

    const results: ExecutionResult[] = [];

    for (const scheduledDoc of dueDocs) {
        const scheduledData = scheduledDoc.data();
        const scheduledOrderId = scheduledDoc.id;

        try {
            const total = scheduledData.items.reduce(
                (sum: number, item: { price: number; quantity: number }) =>
                    sum + item.price * item.quantity,
                0
            );

            const orderId = generateOrderId();

            await adminDb.runTransaction(async (transaction) => {
                // ── READ PHASE ──
                const userRef = adminDb.collection("users").doc(scheduledData.userId);
                const userDoc = await transaction.get(userRef);
                if (!userDoc.exists) throw new Error("User not found");

                const userData = userDoc.data()!;

                if (scheduledData.paymentMethod === "wallet") {
                    const walletBalance = userData.walletBalance || 0;
                    if (walletBalance < total) {
                        throw new Error("INSUFFICIENT_BALANCE");
                    }
                }

                const itemSnapshots: Array<{
                    item: { itemId: string; name: string; quantity: number; price: number };
                    snapshot: FirebaseFirestore.DocumentSnapshot;
                }> = [];

                for (const item of scheduledData.items) {
                    const itemRef = adminDb.collection("menuItems").doc(item.itemId);
                    const itemDoc = await transaction.get(itemRef);
                    itemSnapshots.push({ item, snapshot: itemDoc });
                }

                for (const { item, snapshot: snap } of itemSnapshots) {
                    if (!snap.exists) {
                        throw new Error(`Item "${item.name}" no longer exists`);
                    }
                    const currentQty = snap.data()?.quantity || 0;
                    if (currentQty < item.quantity) {
                        throw new Error(
                            `Insufficient stock for "${item.name}": need ${item.quantity}, only ${currentQty} available`
                        );
                    }
                }

                // ── WRITE PHASE ──
                for (const { item, snapshot: snap } of itemSnapshots) {
                    const itemRef = adminDb.collection("menuItems").doc(item.itemId);
                    const currentQty = snap.data()?.quantity || 0;
                    const newQty = currentQty - item.quantity;
                    transaction.update(itemRef, {
                        quantity: newQty,
                        available: newQty > 0,
                        updatedAt: new Date().toISOString(),
                    });
                }

                if (scheduledData.paymentMethod === "wallet") {
                    transaction.update(userRef, {
                        walletBalance: FieldValue.increment(-total),
                    });
                }

                const orderItems = scheduledData.items.map(
                    (item: { itemId: string; name: string; quantity: number; price: number }) => ({
                        id: item.itemId,
                        name: item.name,
                        price: item.price,
                        quantity: item.quantity,
                    })
                );

                const orderRef = adminDb.collection("orders").doc();
                transaction.set(orderRef, {
                    orderId,
                    userId: scheduledData.userId,
                    userName: userData.name || "Unknown",
                    userEmail: userData.email || "Unknown",
                    userPhone: userData.phone || "",
                    userRollNumber: userData.rollNumber || "",
                    items: orderItems,
                    total,
                    paymentMode: scheduledData.paymentMethod === "wallet" ? "Wallet" : "Razorpay",
                    status: "pending",
                    scheduledOrderId,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                });

                if (scheduledData.paymentMethod === "wallet") {
                    const txnRef = adminDb.collection("walletTransactions").doc();
                    transaction.set(txnRef, {
                        userId: scheduledData.userId,
                        type: "debit",
                        amount: total,
                        description: `Scheduled Order #${orderId}`,
                        transactionId: txnRef.id,
                        createdAt: new Date().toISOString(),
                    });
                }

                try {
                    const orderItemsForInventory = scheduledData.items.map(
                        (item: { itemId: string; name: string; quantity: number }) => ({
                            menuItemId: item.itemId,
                            menuItemName: item.name,
                            quantity: item.quantity,
                        })
                    );
                    await deductInventoryForOrder(transaction, orderItemsForInventory, orderId);
                } catch (invErr) {
                    console.warn(
                        "[ScheduledOrder] Inventory deduction note:",
                        invErr instanceof Error ? invErr.message : invErr
                    );
                }

                const scheduledRef = adminDb.collection("scheduled_orders").doc(scheduledOrderId);
                transaction.update(scheduledRef, {
                    status: "completed",
                    resultOrderId: orderId,
                    updatedAt: new Date().toISOString(),
                });
            });

            results.push({ scheduledOrderId, status: "completed", orderId });
            console.log(`[ScheduledOrder] ✅ Executed ${scheduledOrderId} → Order #${orderId}`);
        } catch (execError) {
            const reason = execError instanceof Error ? execError.message : "Unknown error";
            const failureReason = reason === "INSUFFICIENT_BALANCE" ? "Insufficient wallet balance" : reason;

            await adminDb
                .collection("scheduled_orders")
                .doc(scheduledOrderId)
                .update({
                    status: "failed",
                    failureReason,
                    updatedAt: new Date().toISOString(),
                });

            results.push({ scheduledOrderId, status: "failed", reason: failureReason });
            console.error(`[ScheduledOrder] ❌ Failed ${scheduledOrderId}: ${failureReason}`);
        }
    }

    return { success: true, processed: dueDocs.length, results };
}
