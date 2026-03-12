/**
 * Daily Needs Reservation Service — Core Business Logic
 *
 * All writes via Firebase Admin SDK (server-side only).
 * Transaction-safe stock reservation/release.
 *
 * Reservation lifecycle:
 *   reserved → confirmed → collected
 *                        → no_show (auto by cron)
 *            → expired   (auto if not confirmed by cutoff)
 */

import { adminDb } from "@/lib/firebase-admin";
import type {
    Reservation,
    ReservationStatus,
    UserBehavior,
    ReservationAnalytics,
} from "@/types/reservation";
import { getRestrictionLevel, calculateReliabilityScore } from "@/types/reservation";

const RESERVATIONS_COL = "daily_needs_reservations";
const USER_BEHAVIOR_COL = "user_behavior";
const MENU_ITEMS_COL = "menuItems";

// ─── Timing Config ──────────────────────────────
// Users reserve during the day.
// Confirmation window: 10:00 PM → 12:00 AM (same night).
// Pickup window: 8:00 AM → 2:00 PM (next day).
// Canteen closing = 2:00 PM — after that, no-show.
const CONFIRM_WINDOW_START_HOUR = 22;  // 10 PM
const CONFIRM_CUTOFF_HOUR = 0;         // 12 AM (midnight)
const PICKUP_START_HOUR = 8;           // 8 AM next day
const PICKUP_END_HOUR = 14;            // 2 PM (canteen close)

// ─── Helpers ────────────────────────────────────

function getTodayDate(): string {
    return new Date().toISOString().split("T")[0]; // YYYY-MM-DD
}

function getTomorrowDate(): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
}

function buildPickupWindow(reservationDateStr: string) {
    // Reservation date = today. Confirmation tonight, pickup tomorrow.
    const base = new Date(reservationDateStr + "T00:00:00+05:30");

    // Confirmation expiry = midnight tonight (end of reservation day)
    const expiry = new Date(base);
    expiry.setDate(expiry.getDate() + 1); // midnight = start of next day
    expiry.setHours(CONFIRM_CUTOFF_HOUR, 0, 0, 0);

    // Pickup window = next day 8 AM – 2 PM
    const nextDay = new Date(base);
    nextDay.setDate(nextDay.getDate() + 1);

    const start = new Date(nextDay);
    start.setHours(PICKUP_START_HOUR, 0, 0, 0);

    const end = new Date(nextDay);
    end.setHours(PICKUP_END_HOUR, 0, 0, 0);

    return {
        pickupWindowStart: start.toISOString(),
        pickupWindowEnd: end.toISOString(),
        expiryTime: expiry.toISOString(),
    };
}

// ─── CREATE RESERVATION ─────────────────────────

export async function createReservation(
    userId: string,
    itemId: string,
    quantity: number
): Promise<{ reservation: Reservation } | { error: string; code: number }> {
    // 1. Check user behavior restrictions
    const behavior = await getUserBehavior(userId);
    if (behavior.restrictionLevel === "disabled") {
        return {
            error: "Your daily needs access is temporarily disabled due to repeated no-shows. Contact the canteen to restore.",
            code: 403,
        };
    }
    if (behavior.restrictionLevel === "limited" && quantity > 2) {
        return {
            error: "Your reservations are limited to 2 units per item due to past no-shows.",
            code: 403,
        };
    }

    // 2. Verify menu item exists
    const itemDoc = await adminDb.collection(MENU_ITEMS_COL).doc(itemId).get();
    if (!itemDoc.exists) {
        return { error: "Menu item not found", code: 404 };
    }
    const itemName = itemDoc.data()?.name ?? "Unknown Item";

    // 3. Check for duplicate reservation today
    const today = getTodayDate();
    const existingSnap = await adminDb
        .collection(RESERVATIONS_COL)
        .where("userId", "==", userId)
        .where("itemId", "==", itemId)
        .where("reservationDate", "==", today)
        .where("status", "in", ["reserved", "confirmed"])
        .limit(1)
        .get();

    if (!existingSnap.empty) {
        return { error: "You already have an active reservation for this item today", code: 409 };
    }

    // 4. Build reservation
    const now = new Date().toISOString();
    const window = buildPickupWindow(today);

    const ref = adminDb.collection(RESERVATIONS_COL).doc();
    const reservation: Omit<Reservation, "id"> = {
        userId,
        itemId,
        itemName,
        quantity,
        status: "reserved",
        reservationDate: today,
        pickupWindowStart: window.pickupWindowStart,
        pickupWindowEnd: window.pickupWindowEnd,
        confirmedAt: null,
        collectedAt: null,
        expiryTime: window.expiryTime,
        createdAt: now,
        updatedAt: now,
    };

    await ref.set(reservation);

    // 5. Increment total reservations
    await incrementTotalReservations(userId);

    console.log(`[Reservations] Created ${ref.id} for user ${userId}, item ${itemName}`);
    return { reservation: { id: ref.id, ...reservation } };
}

// ─── CONFIRM RESERVATION ────────────────────────

export async function confirmReservation(
    reservationId: string,
    userId: string
): Promise<{ success: true } | { error: string; code: number }> {
    const ref = adminDb.collection(RESERVATIONS_COL).doc(reservationId);

    try {
        await adminDb.runTransaction(async (tx) => {
            const doc = await tx.get(ref);
            if (!doc.exists) throw new Error("NOT_FOUND");

            const data = doc.data() as Omit<Reservation, "id">;
            if (data.userId !== userId) throw new Error("FORBIDDEN");
            if (data.status !== "reserved") throw new Error(`INVALID_STATUS:${data.status}`);

            // Check cutoff
            const now = new Date();
            if (now > new Date(data.expiryTime)) {
                // Auto-expire
                tx.update(ref, {
                    status: "expired" as ReservationStatus,
                    updatedAt: now.toISOString(),
                });
                throw new Error("CUTOFF_PASSED");
            }

            tx.update(ref, {
                status: "confirmed" as ReservationStatus,
                confirmedAt: now.toISOString(),
                updatedAt: now.toISOString(),
            });
        });

        // Track confirmed order in user behavior
        await incrementConfirmedOrders(userId);

        console.log(`[Reservations] Confirmed ${reservationId}`);
        return { success: true };
    } catch (err: any) {
        const msg = err.message || "";
        if (msg === "NOT_FOUND") return { error: "Reservation not found", code: 404 };
        if (msg === "FORBIDDEN") return { error: "Not your reservation", code: 403 };
        if (msg === "CUTOFF_PASSED") return { error: "Confirmation window has closed", code: 410 };
        if (msg.startsWith("INVALID_STATUS:"))
            return { error: `Cannot confirm — status is ${msg.split(":")[1]}`, code: 400 };
        throw err;
    }
}

// ─── MARK COLLECTED ─────────────────────────────

export async function markCollected(
    reservationId: string,
    userId: string
): Promise<{ success: true } | { error: string; code: number }> {
    const ref = adminDb.collection(RESERVATIONS_COL).doc(reservationId);

    try {
        await adminDb.runTransaction(async (tx) => {
            const doc = await tx.get(ref);
            if (!doc.exists) throw new Error("NOT_FOUND");

            const data = doc.data() as Omit<Reservation, "id">;
            if (data.userId !== userId) throw new Error("FORBIDDEN");
            if (data.status !== "confirmed") throw new Error(`INVALID_STATUS:${data.status}`);

            const now = new Date().toISOString();
            tx.update(ref, {
                status: "collected" as ReservationStatus,
                collectedAt: now,
                updatedAt: now,
            });
        });

        // Track pickup in user behavior
        await incrementPickedUpOrders(userId);

        console.log(`[Reservations] Collected ${reservationId}`);
        return { success: true };
    } catch (err: any) {
        const msg = err.message || "";
        if (msg === "NOT_FOUND") return { error: "Reservation not found", code: 404 };
        if (msg === "FORBIDDEN") return { error: "Not your reservation", code: 403 };
        if (msg.startsWith("INVALID_STATUS:"))
            return { error: `Cannot collect — status is ${msg.split(":")[1]}`, code: 400 };
        throw err;
    }
}

// ─── RELEASE EXPIRED RESERVATIONS (Cron) ────────

export async function releaseExpiredReservations(): Promise<{
    expiredCount: number;
    noShowCount: number;
}> {
    const now = new Date();
    const nowIso = now.toISOString();
    let expiredCount = 0;
    let noShowCount = 0;

    // 1. Expire unconfirmed reservations past cutoff
    const unconfirmedSnap = await adminDb
        .collection(RESERVATIONS_COL)
        .where("status", "==", "reserved")
        .where("expiryTime", "<=", nowIso)
        .limit(200)
        .get();

    if (!unconfirmedSnap.empty) {
        const batch = adminDb.batch();
        unconfirmedSnap.forEach((doc) => {
            batch.update(doc.ref, {
                status: "expired" as ReservationStatus,
                updatedAt: nowIso,
            });
        });
        await batch.commit();
        expiredCount = unconfirmedSnap.size;
        console.log(`[Cron] Expired ${expiredCount} unconfirmed reservations`);
    }

    // 2. Mark no-show for confirmed reservations past pickup window
    const noShowSnap = await adminDb
        .collection(RESERVATIONS_COL)
        .where("status", "==", "confirmed")
        .where("pickupWindowEnd", "<=", nowIso)
        .limit(200)
        .get();

    if (!noShowSnap.empty) {
        const batch = adminDb.batch();
        const usersToUpdate = new Set<string>();

        noShowSnap.forEach((doc) => {
            batch.update(doc.ref, {
                status: "no_show" as ReservationStatus,
                updatedAt: nowIso,
            });
            usersToUpdate.add(doc.data().userId);
        });

        await batch.commit();
        noShowCount = noShowSnap.size;

        // Update no-show counts for affected users
        for (const uid of usersToUpdate) {
            await updateNoShowCount(uid);
        }

        console.log(`[Cron] Marked ${noShowCount} no-shows for ${usersToUpdate.size} users`);
    }

    return { expiredCount, noShowCount };
}

// ─── USER BEHAVIOR ──────────────────────────────

export async function getUserBehavior(userId: string): Promise<UserBehavior> {
    const doc = await adminDb.collection(USER_BEHAVIOR_COL).doc(userId).get();

    if (!doc.exists) {
        // Return defaults for new users
        return {
            userId,
            noShowCount: 0,
            totalReservations: 0,
            confirmedOrders: 0,
            pickedUpOrders: 0,
            reliabilityScore: 100,
            lastNoShowAt: null,
            restrictionLevel: "none",
            updatedAt: new Date().toISOString(),
        };
    }

    const data = doc.data()!;
    return {
        userId,
        noShowCount: data.noShowCount ?? 0,
        totalReservations: data.totalReservations ?? 0,
        confirmedOrders: data.confirmedOrders ?? 0,
        pickedUpOrders: data.pickedUpOrders ?? 0,
        reliabilityScore: data.reliabilityScore ?? 100,
        lastNoShowAt: data.lastNoShowAt ?? null,
        restrictionLevel: data.restrictionLevel ?? "none",
        updatedAt: data.updatedAt ?? new Date().toISOString(),
    };
}

async function incrementTotalReservations(userId: string): Promise<void> {
    const ref = adminDb.collection(USER_BEHAVIOR_COL).doc(userId);
    const doc = await ref.get();
    const now = new Date().toISOString();

    if (!doc.exists) {
        await ref.set({
            noShowCount: 0,
            totalReservations: 1,
            confirmedOrders: 0,
            pickedUpOrders: 0,
            reliabilityScore: 100,
            lastNoShowAt: null,
            restrictionLevel: "none",
            updatedAt: now,
        });
    } else {
        const data = doc.data()!;
        await ref.update({
            totalReservations: (data.totalReservations || 0) + 1,
            updatedAt: now,
        });
    }
}

async function incrementConfirmedOrders(userId: string): Promise<void> {
    const ref = adminDb.collection(USER_BEHAVIOR_COL).doc(userId);
    const doc = await ref.get();
    const now = new Date().toISOString();

    if (!doc.exists) {
        await ref.set({
            noShowCount: 0,
            totalReservations: 0,
            confirmedOrders: 1,
            pickedUpOrders: 0,
            reliabilityScore: 100,
            lastNoShowAt: null,
            restrictionLevel: "none",
            updatedAt: now,
        });
    } else {
        const data = doc.data()!;
        const confirmedOrders = (data.confirmedOrders || 0) + 1;
        const pickedUpOrders = data.pickedUpOrders || 0;
        await ref.update({
            confirmedOrders,
            reliabilityScore: calculateReliabilityScore(confirmedOrders, pickedUpOrders),
            updatedAt: now,
        });
    }
}

async function incrementPickedUpOrders(userId: string): Promise<void> {
    const ref = adminDb.collection(USER_BEHAVIOR_COL).doc(userId);
    const doc = await ref.get();
    const now = new Date().toISOString();

    if (!doc.exists) {
        await ref.set({
            noShowCount: 0,
            totalReservations: 0,
            confirmedOrders: 0,
            pickedUpOrders: 1,
            reliabilityScore: 100,
            lastNoShowAt: null,
            restrictionLevel: "none",
            updatedAt: now,
        });
    } else {
        const data = doc.data()!;
        const pickedUpOrders = (data.pickedUpOrders || 0) + 1;
        const confirmedOrders = data.confirmedOrders || 0;
        await ref.update({
            pickedUpOrders,
            reliabilityScore: calculateReliabilityScore(confirmedOrders, pickedUpOrders),
            updatedAt: now,
        });
    }
}

async function updateNoShowCount(userId: string): Promise<void> {
    const ref = adminDb.collection(USER_BEHAVIOR_COL).doc(userId);

    await adminDb.runTransaction(async (tx) => {
        const doc = await tx.get(ref);
        const now = new Date().toISOString();

        if (!doc.exists) {
            tx.set(ref, {
                noShowCount: 1,
                totalReservations: 0,
                confirmedOrders: 0,
                pickedUpOrders: 0,
                reliabilityScore: 0,
                lastNoShowAt: now,
                restrictionLevel: getRestrictionLevel(1),
                updatedAt: now,
            });
            return;
        }

        const data = doc.data()!;
        const newNoShowCount = (data.noShowCount || 0) + 1;
        const confirmedOrders = data.confirmedOrders || 0;
        const pickedUpOrders = data.pickedUpOrders || 0;

        tx.update(ref, {
            noShowCount: newNoShowCount,
            reliabilityScore: calculateReliabilityScore(confirmedOrders, pickedUpOrders),
            lastNoShowAt: now,
            restrictionLevel: getRestrictionLevel(newNoShowCount),
            updatedAt: now,
        });
    });
}

// ─── USER RESERVATIONS QUERY ────────────────────

export async function getUserReservationsForDate(
    userId: string,
    date?: string
): Promise<Reservation[]> {
    const targetDate = date || getTodayDate();

    const snap = await adminDb
        .collection(RESERVATIONS_COL)
        .where("userId", "==", userId)
        .where("reservationDate", "==", targetDate)
        .get();

    return snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Reservation))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ─── ANALYTICS ──────────────────────────────────

export async function getReservationAnalytics(): Promise<ReservationAnalytics> {
    const today = getTodayDate();

    // Today's reservations
    const todaySnap = await adminDb
        .collection(RESERVATIONS_COL)
        .where("reservationDate", "==", today)
        .get();

    const todayStats = {
        reserved: 0,
        confirmed: 0,
        collected: 0,
        expired: 0,
        noShow: 0,
        total: todaySnap.size,
    };

    todaySnap.forEach((doc) => {
        const status = doc.data().status as ReservationStatus;
        if (status === "reserved") todayStats.reserved++;
        else if (status === "confirmed") todayStats.confirmed++;
        else if (status === "collected") todayStats.collected++;
        else if (status === "expired") todayStats.expired++;
        else if (status === "no_show") todayStats.noShow++;
    });

    // No-show rate (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const weekSnap = await adminDb
        .collection(RESERVATIONS_COL)
        .where("reservationDate", ">=", sevenDaysAgo.toISOString().split("T")[0])
        .get();

    const weekTotal = weekSnap.size;
    let weekNoShows = 0;
    const noShowItemMap: Record<string, number> = {};

    weekSnap.forEach((doc) => {
        const data = doc.data();
        if (data.status === "no_show") {
            weekNoShows++;
            noShowItemMap[data.itemName] = (noShowItemMap[data.itemName] || 0) + 1;
        }
    });

    const noShowRate = weekTotal > 0 ? Math.round((weekNoShows / weekTotal) * 100) : 0;

    const topNoShowItems = Object.entries(noShowItemMap)
        .map(([itemName, noShowCount]) => ({ itemName, noShowCount }))
        .sort((a, b) => b.noShowCount - a.noShowCount)
        .slice(0, 5);

    // Demand forecast for tomorrow
    const demandForecast = await getDemandForecast();

    return { todayStats, noShowRate, topNoShowItems, demandForecast };
}

// ─── DEMAND FORECAST ────────────────────────────

export async function getDemandForecast(): Promise<Record<string, number>> {
    // Use collected reservations from the last 14 days as a baseline
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const cutoffDate = fourteenDaysAgo.toISOString().split("T")[0];

    const tomorrow = getTomorrowDate();
    const tomorrowDow = new Date(tomorrow + "T00:00:00").getDay(); // 0=Sun, 1=Mon…

    const historySnap = await adminDb
        .collection(RESERVATIONS_COL)
        .where("reservationDate", ">=", cutoffDate)
        .where("status", "in", ["collected", "confirmed"])
        .get();

    // Group by item + day-of-week, average out
    const itemDayMap: Record<string, { total: number; days: Set<string> }> = {};

    historySnap.forEach((doc) => {
        const data = doc.data();
        const dow = new Date(data.reservationDate + "T00:00:00").getDay();
        if (dow !== tomorrowDow) return; // only same weekday

        const key = data.itemName;
        if (!itemDayMap[key]) {
            itemDayMap[key] = { total: 0, days: new Set() };
        }
        itemDayMap[key].total += data.quantity;
        itemDayMap[key].days.add(data.reservationDate);
    });

    const forecast: Record<string, number> = {};
    for (const [itemName, agg] of Object.entries(itemDayMap)) {
        const avg = Math.ceil(agg.total / Math.max(agg.days.size, 1));
        if (avg > 0) forecast[itemName] = avg;
    }

    return forecast;
}

// ─── CONFIRMED DEMAND (Stock Manager) ───────────

export interface ConfirmedDemandItem {
    itemName: string;
    itemId: string;
    totalQuantity: number;
    reservationCount: number;
}

export async function getConfirmedDemandForStockManager(
    date?: string
): Promise<ConfirmedDemandItem[]> {
    const targetDate = date || getTodayDate();

    const snap = await adminDb
        .collection(RESERVATIONS_COL)
        .where("reservationDate", "==", targetDate)
        .where("status", "==", "confirmed")
        .get();

    // Aggregate by item
    const itemMap: Record<string, ConfirmedDemandItem> = {};

    snap.forEach((doc) => {
        const data = doc.data();
        const key = data.itemId;

        if (!itemMap[key]) {
            itemMap[key] = {
                itemName: data.itemName,
                itemId: data.itemId,
                totalQuantity: 0,
                reservationCount: 0,
            };
        }
        itemMap[key].totalQuantity += data.quantity;
        itemMap[key].reservationCount += 1;
    });

    return Object.values(itemMap).sort(
        (a, b) => b.totalQuantity - a.totalQuantity
    );
}
