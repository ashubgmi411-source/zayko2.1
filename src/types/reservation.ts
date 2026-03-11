/**
 * Reservation System — Type Definitions
 *
 * Covers:
 * - daily_needs_reservations collection
 * - user_behavior collection
 * - Request/Response types for reservation API
 */

// ─── Reservation Status ─────────────────────────
export type ReservationStatus =
    | "reserved"
    | "confirmed"
    | "collected"
    | "expired"
    | "no_show";

// ─── Restriction Level ──────────────────────────
export type RestrictionLevel =
    | "none"
    | "warning"
    | "limited"
    | "disabled";

// ─── Firestore Documents ────────────────────────

/** daily_needs_reservations collection */
export interface Reservation {
    id: string;
    userId: string;
    itemId: string;
    itemName: string;
    quantity: number;
    status: ReservationStatus;
    reservationDate: string;        // YYYY-MM-DD
    pickupWindowStart: string;      // ISO timestamp
    pickupWindowEnd: string;        // ISO timestamp
    confirmedAt: string | null;
    collectedAt: string | null;
    expiryTime: string;             // ISO timestamp — cutoff for confirmation
    createdAt: string;
    updatedAt: string;
}

/** user_behavior collection */
export interface UserBehavior {
    userId: string;
    noShowCount: number;
    totalReservations: number;
    reliabilityScore: number;       // 0–100
    lastNoShowAt: string | null;
    restrictionLevel: RestrictionLevel;
    updatedAt: string;
}

// ─── Request Types ──────────────────────────────

export interface CreateReservationRequest {
    itemId: string;
    quantity: number;
}

export interface ConfirmReservationRequest {
    reservationId: string;
}

export interface CollectReservationRequest {
    reservationId: string;
}

// ─── Analytics Types ────────────────────────────

export interface ReservationAnalytics {
    todayStats: {
        reserved: number;
        confirmed: number;
        collected: number;
        expired: number;
        noShow: number;
        total: number;
    };
    noShowRate: number;             // percentage 0–100
    topNoShowItems: Array<{
        itemName: string;
        noShowCount: number;
    }>;
    demandForecast: Record<string, number>; // itemName → expected qty
}

// ─── Helper ─────────────────────────────────────

export function getRestrictionLevel(noShowCount: number): RestrictionLevel {
    if (noShowCount >= 10) return "disabled";
    if (noShowCount >= 5) return "limited";
    if (noShowCount >= 3) return "warning";
    return "none";
}

export function calculateReliabilityScore(
    totalReservations: number,
    noShowCount: number
): number {
    if (totalReservations === 0) return 100;
    const score = Math.round(
        ((totalReservations - noShowCount) / totalReservations) * 100
    );
    return Math.max(0, Math.min(100, score));
}
