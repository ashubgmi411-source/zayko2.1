"use client";
import React, { useEffect, useState, useRef } from "react";
import toast from "react-hot-toast";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";

const ALL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_SHORT: Record<string, string> = {
    Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed",
    Thursday: "Thu", Friday: "Fri", Saturday: "Sat", Sunday: "Sun",
};

function getTodayDayName(): string {
    return new Date().toLocaleDateString("en-US", { weekday: "long" });
}

interface DashboardData {
    summary: {
        totalActiveUsers: number;
        highestDemandItem: string;
        highestDemandQty: number;
        mostDemandingDay: string;
        mostDemandingDayQty: number;
        itemsAtRisk: number;
        todayDay: string;
        tomorrowDay: string;
    };
    todayForecast: Record<string, number>;
    tomorrowForecast: Record<string, number>;
    demandByDay: Record<string, Record<string, number>>;
    weeklyTotals: Record<string, number>;
}

interface LiveDemandItem {
    itemId: string;
    itemName: string;
    totalDemand: number;
    activeUsers: number;
}

interface DayDemandItem {
    itemName: string;
    requiredQuantity: number;
}

interface ReservationAnalyticsData {
    todayStats: {
        reserved: number;
        confirmed: number;
        collected: number;
        expired: number;
        noShow: number;
        total: number;
    };
    noShowRate: number;
    topNoShowItems: Array<{ itemName: string; noShowCount: number }>;
    demandForecast: Record<string, number>;
}

interface ConfirmedDemandItem {
    itemName: string;
    itemId: string;
    totalQuantity: number;
    reservationCount: number;
}

export default function StockManagerDashboard() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const reportRef = useRef<HTMLDivElement>(null);

    const [liveDemand, setLiveDemand] = useState<LiveDemandItem[]>([]);
    const [liveTotalStudents, setLiveTotalStudents] = useState(0);
    const [liveTotalNeeds, setLiveTotalNeeds] = useState(0);
    const [liveConnected, setLiveConnected] = useState(false);

    // ─── Raw Data for Client-Side Aggregation (Real-time) ───
    const [rawDailyDemands, setRawDailyDemands] = useState<any[]>([]);
    const [rawDemandPlans, setRawDemandPlans] = useState<any[]>([]);

    // ─── Day-wise Purchase Requirement ────
    const [selectedPurchaseDay, setSelectedPurchaseDay] = useState(getTodayDayName());
    const [dayDemandItems, setDayDemandItems] = useState<DayDemandItem[]>([]);
    const [dayTotalQuantity, setDayTotalQuantity] = useState(0);

    // ─── Reservation Analytics ────
    const [resAnalytics, setResAnalytics] = useState<ReservationAnalyticsData | null>(null);
    const [resLoading, setResLoading] = useState(false);

    // ─── Confirmed Demand (Stock Manager View) ────
    const [confirmedItems, setConfirmedItems] = useState<ConfirmedDemandItem[]>([]);
    const [confirmedTotal, setConfirmedTotal] = useState(0);
    const [confirmedLoading, setConfirmedLoading] = useState(false);

    const getHeaders = () => ({
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("stockManagerToken")}`,
    });

    useEffect(() => {
        fetchData();
        fetchReservationAnalytics();
        fetchConfirmedDemand();
    }, []);

    const fetchData = async () => {
        try {
            const res = await fetch("/api/stock/dashboard", { headers: getHeaders() });
            const json = await res.json();
            if (json.success) {
                setData(json);
            } else {
                toast.error(json.error || "Failed to load data");
            }
        } catch {
            toast.error("Failed to load dashboard data");
        }
        setLoading(false);
    };

    const fetchReservationAnalytics = async () => {
        setResLoading(true);
        try {
            const res = await fetch("/api/daily-demands/analytics", { headers: getHeaders() });
            const json = await res.json();
            if (json.success) {
                setResAnalytics(json.analytics);
            }
        } catch {
            // Analytics may not be available yet — silently fail
        }
        setResLoading(false);
    };

    const fetchConfirmedDemand = async () => {
        setConfirmedLoading(true);
        try {
            const res = await fetch("/api/daily-demands/confirmed", { headers: getHeaders() });
            const json = await res.json();
            if (json.success) {
                setConfirmedItems(json.items);
                setConfirmedTotal(json.totalQuantity);
            }
        } catch {
            // Silently fail — data may not exist yet
        }
        setConfirmedLoading(false);
    };

    // ─── Real-time Firestore Listeners ──────────────
    useEffect(() => {
        const unsubDaily = onSnapshot(
            query(collection(db, "dailyDemands"), where("isActive", "==", true)),
            (snap) => {
                setRawDailyDemands(snap.docs.map((doc) => doc.data()));
                setLiveConnected(true);
            },
            (err) => {
                console.error("[LiveDemand] dailyDemands error:", err);
                setLiveConnected(false);
            }
        );

        const unsubPlans = onSnapshot(
            query(collection(db, "userDemandPlans"), where("isActive", "==", true)),
            (snap) => {
                setRawDemandPlans(snap.docs.map((doc) => doc.data()));
            },
            (err) => {
                console.error("[LiveDemand] userDemandPlans error:", err);
            }
        );

        return () => {
            unsubDaily();
            unsubPlans();
        };
    }, []);

    // ─── Compute Aggregated Data ──────────────
    useEffect(() => {
        const itemMap: Record<string, { itemId: string; itemName: string; totalDemand: number; users: Set<string> }> = {};
        const dayDemandMap: Record<string, number> = {};
        const allUsers = new Set<string>();

        const processDoc = (d: any, isDailyDemand: boolean) => {
            const key = d.itemId || "unknown-id";
            const itemName = d.itemName || "Unknown";
            const qty = d.quantity || 0;
            const userId = d.userId;
            const days: string[] = d.days || [];

            if (userId) allUsers.add(userId);

            if (!itemMap[key]) {
                itemMap[key] = { itemId: key, itemName, totalDemand: 0, users: new Set() };
            }
            itemMap[key].totalDemand += qty;
            if (userId) itemMap[key].users.add(userId);

            const targetDay = isDailyDemand ? DAY_SHORT[selectedPurchaseDay] : selectedPurchaseDay;

            if (days.includes(targetDay)) {
                dayDemandMap[itemName] = (dayDemandMap[itemName] || 0) + qty;
            }
        };

        rawDailyDemands.forEach((d) => processDoc(d, true));
        rawDemandPlans.forEach((d) => processDoc(d, false));

        const liveItems = Object.values(itemMap)
            .map((item) => ({
                itemId: item.itemId,
                itemName: item.itemName,
                totalDemand: item.totalDemand,
                activeUsers: item.users.size,
            }))
            .sort((a, b) => b.totalDemand - a.totalDemand);

        setLiveDemand(liveItems);
        setLiveTotalStudents(allUsers.size);
        setLiveTotalNeeds(rawDailyDemands.length + rawDemandPlans.length);

        const purchaseItems = Object.entries(dayDemandMap)
            .filter(([, qty]) => qty > 0)
            .map(([itemName, requiredQuantity]) => ({ itemName, requiredQuantity }))
            .sort((a, b) => b.requiredQuantity - a.requiredQuantity);

        setDayDemandItems(purchaseItems);
        setDayTotalQuantity(purchaseItems.reduce((s, i) => s + i.requiredQuantity, 0));
    }, [rawDailyDemands, rawDemandPlans, selectedPurchaseDay]);

    const handlePrintReport = () => {
        window.print();
    };

    return (
        <div className="min-h-screen bg-zayko-900 pb-12" ref={reportRef}>
            {/* ─── Header ─── */}
            <div className="bg-zayko-800 border-b border-zayko-700 px-6 py-4 no-print">
                <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-xl">📊</div>
                        <div>
                            <h1 className="text-lg font-display font-bold text-white">Dashboard Overview</h1>
                            <p className="text-xs text-emerald-400">Demand & Inventory Planning</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handlePrintReport}
                            className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-xl text-sm font-semibold hover:bg-blue-500/30 transition-all"
                        >
                            📄 Download Report
                        </button>
                        <button
                            onClick={() => { setLoading(true); fetchData(); fetchReservationAnalytics(); fetchConfirmedDemand(); }}
                            className="px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-xl text-sm font-semibold hover:bg-emerald-500/30 transition-all"
                        >
                            🔄 Refresh
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto p-6">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-12 h-12 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : !data ? (
                    <div className="text-center py-20 text-zayko-400">Failed to load data</div>
                ) : (
                    <>
                        {/* ─── Summary Cards ─── */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 animate-fade-in">
                            {[
                                { label: "Active Users", value: data.summary.totalActiveUsers, icon: "👥", color: "text-blue-400" },
                                { label: "Top Item", value: data.summary.highestDemandItem, sub: `${data.summary.highestDemandQty} units/week`, icon: "🔥", color: "text-gold-400" },
                                { label: "Peak Day", value: data.summary.mostDemandingDay, sub: `${data.summary.mostDemandingDayQty} units`, icon: "📅", color: "text-purple-400" },
                                { label: "Items at Risk", value: data.summary.itemsAtRisk, icon: "⚠️", color: data.summary.itemsAtRisk > 0 ? "text-red-400" : "text-emerald-400" },
                            ].map((card) => (
                                <div key={card.label} className="bg-zayko-800/50 border border-zayko-700 rounded-2xl p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-lg">{card.icon}</span>
                                        <span className="text-xs text-zayko-400">{card.label}</span>
                                    </div>
                                    <p className={`text-xl font-display font-bold ${card.color} truncate`}>{card.value}</p>
                                    {"sub" in card && card.sub && <p className="text-xs text-zayko-500 mt-0.5">{card.sub}</p>}
                                </div>
                            ))}
                        </div>

                        {/* ─── 📡 Live Demand (Real-time) ─── */}
                        <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/20 rounded-2xl p-6 mb-8 animate-slide-up">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-xl">📡</div>
                                    <div>
                                        <h2 className="text-base font-display font-bold text-white">Live Student Demand</h2>
                                        <p className="text-[10px] text-emerald-400 uppercase tracking-wider font-bold">Real-time • Auto-updating</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`w-2.5 h-2.5 rounded-full ${liveConnected ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`}></span>
                                    <span className="text-xs text-zayko-400">{liveConnected ? "Connected" : "Disconnected"}</span>
                                </div>
                            </div>

                            {/* Live Stats */}
                            <div className="grid grid-cols-3 gap-3 mb-4">
                                <div className="bg-white/5 rounded-xl p-3 text-center">
                                    <p className="text-2xl font-display font-bold text-emerald-400">{liveTotalStudents}</p>
                                    <p className="text-[10px] text-zayko-400 uppercase tracking-wider font-bold mt-1">Students Active</p>
                                </div>
                                <div className="bg-white/5 rounded-xl p-3 text-center">
                                    <p className="text-2xl font-display font-bold text-blue-400">{liveTotalNeeds}</p>
                                    <p className="text-[10px] text-zayko-400 uppercase tracking-wider font-bold mt-1">Active Demands</p>
                                </div>
                                <div className="bg-white/5 rounded-xl p-3 text-center">
                                    <p className="text-2xl font-display font-bold text-purple-400">{liveDemand.length}</p>
                                    <p className="text-[10px] text-zayko-400 uppercase tracking-wider font-bold mt-1">Unique Items</p>
                                </div>
                            </div>

                            {/* Live Item-wise Demand */}
                            {liveDemand.length === 0 ? (
                                <div className="text-center py-6 text-zayko-500 text-sm">
                                    No active student demands right now
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {liveDemand.map((item) => (
                                        <div key={item.itemId} className="flex items-center justify-between py-2.5 px-4 bg-white/5 rounded-xl hover:bg-white/10 transition-all">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <span className="text-sm font-semibold text-white truncate">{item.itemName}</span>
                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-bold shrink-0">
                                                    {item.activeUsers} student{item.activeUsers !== 1 ? "s" : ""}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="text-xl font-display font-bold text-emerald-400">{item.totalDemand}</span>
                                                <span className="text-[10px] text-zayko-500">units</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* ─── 📋 Reservation Analytics ─── */}
                        {resAnalytics && (
                            <div className="bg-gradient-to-br from-purple-500/10 to-indigo-500/5 border border-purple-500/20 rounded-2xl p-6 mb-8 animate-slide-up">
                                <div className="flex items-center gap-3 mb-5">
                                    <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-xl">📋</div>
                                    <div>
                                        <h2 className="text-base font-display font-bold text-white">Reservation Analytics</h2>
                                        <p className="text-[10px] text-purple-400 uppercase tracking-wider font-bold">Today&apos;s reservation tracking</p>
                                    </div>
                                </div>

                                {/* Stats grid */}
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
                                    {[
                                        { label: "Reserved", value: resAnalytics.todayStats.reserved, color: "text-yellow-400" },
                                        { label: "Confirmed", value: resAnalytics.todayStats.confirmed, color: "text-blue-400" },
                                        { label: "Collected", value: resAnalytics.todayStats.collected, color: "text-emerald-400" },
                                        { label: "Expired", value: resAnalytics.todayStats.expired, color: "text-zinc-400" },
                                        { label: "No-Show", value: resAnalytics.todayStats.noShow, color: "text-red-400" },
                                    ].map((s) => (
                                        <div key={s.label} className="bg-white/5 rounded-xl p-3 text-center">
                                            <p className={`text-2xl font-display font-bold ${s.color}`}>{s.value}</p>
                                            <p className="text-[10px] text-zayko-400 uppercase tracking-wider font-bold mt-1">{s.label}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* No-show rate */}
                                <div className="flex items-center gap-4 mb-5">
                                    <div className="flex-1 bg-white/5 rounded-xl p-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs text-zayko-400 font-semibold">No-Show Rate (7 days)</span>
                                            <span className={`text-lg font-display font-bold ${resAnalytics.noShowRate > 20 ? "text-red-400" : resAnalytics.noShowRate > 10 ? "text-yellow-400" : "text-emerald-400"}`}>
                                                {resAnalytics.noShowRate}%
                                            </span>
                                        </div>
                                        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-500 ${resAnalytics.noShowRate > 20 ? "bg-red-500" : resAnalytics.noShowRate > 10 ? "bg-yellow-500" : "bg-emerald-500"}`}
                                                style={{ width: `${Math.min(resAnalytics.noShowRate, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Top no-show items */}
                                {resAnalytics.topNoShowItems.length > 0 && (
                                    <div className="mb-5">
                                        <h3 className="text-xs text-zayko-400 font-semibold uppercase tracking-wider mb-2">Top No-Show Items</h3>
                                        <div className="space-y-1.5">
                                            {resAnalytics.topNoShowItems.map((item) => (
                                                <div key={item.itemName} className="flex items-center justify-between py-2 px-3 bg-white/5 rounded-xl">
                                                    <span className="text-sm text-white">{item.itemName}</span>
                                                    <span className="text-sm font-bold text-red-400">{item.noShowCount} no-shows</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Demand Forecast */}
                                {Object.keys(resAnalytics.demandForecast).length > 0 && (
                                    <div>
                                        <h3 className="text-xs text-zayko-400 font-semibold uppercase tracking-wider mb-2">📈 Tomorrow&apos;s Demand Forecast</h3>
                                        <div className="space-y-1.5">
                                            {Object.entries(resAnalytics.demandForecast)
                                                .sort(([, a], [, b]) => b - a)
                                                .map(([name, qty]) => (
                                                    <div key={name} className="flex items-center justify-between py-2 px-3 bg-white/5 rounded-xl">
                                                        <span className="text-sm text-white">{name}</span>
                                                        <span className="text-sm font-bold text-purple-400">~{qty} units</span>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ─── ✅ Confirmed Demand (Only what to buy) ─── */}
                        <div className="bg-gradient-to-br from-emerald-500/10 to-green-500/5 border border-emerald-500/20 rounded-2xl p-6 mb-8 animate-slide-up">
                            <div className="flex items-center justify-between mb-5">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-xl">✅</div>
                                    <div>
                                        <h2 className="text-base font-display font-bold text-white">Confirmed Demand</h2>
                                        <p className="text-[10px] text-emerald-400 uppercase tracking-wider font-bold">Only confirmed orders • Buy this</p>
                                    </div>
                                </div>
                                <button
                                    onClick={fetchConfirmedDemand}
                                    disabled={confirmedLoading}
                                    className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg text-xs font-bold hover:bg-emerald-500/20 transition-all disabled:opacity-50"
                                >
                                    {confirmedLoading ? "Loading…" : "🔄 Refresh"}
                                </button>
                            </div>

                            {/* Summary stats */}
                            <div className="grid grid-cols-2 gap-3 mb-5">
                                <div className="bg-white/5 rounded-xl p-4 text-center">
                                    <p className="text-3xl font-display font-bold text-emerald-400">{confirmedItems.length}</p>
                                    <p className="text-[10px] text-zayko-400 uppercase tracking-wider font-bold mt-1">Unique Items</p>
                                </div>
                                <div className="bg-white/5 rounded-xl p-4 text-center">
                                    <p className="text-3xl font-display font-bold text-emerald-400">{confirmedTotal}</p>
                                    <p className="text-[10px] text-zayko-400 uppercase tracking-wider font-bold mt-1">Total Quantity</p>
                                </div>
                            </div>

                            {/* Confirmed items list */}
                            {confirmedItems.length === 0 ? (
                                <div className="text-center py-6 text-zayko-500 text-sm">
                                    No confirmed reservations yet for today
                                </div>
                            ) : (
                                <div className="bg-zayko-800/50 border border-zayko-700 rounded-2xl overflow-hidden">
                                    <table className="w-full text-sm text-left">
                                        <thead>
                                            <tr className="border-b border-zayko-700 bg-zayko-800/50">
                                                <th className="px-6 py-3 text-zayko-400 font-semibold text-xs uppercase tracking-wider">#</th>
                                                <th className="px-6 py-3 text-zayko-400 font-semibold text-xs uppercase tracking-wider">Item</th>
                                                <th className="px-6 py-3 text-zayko-400 font-semibold text-xs uppercase tracking-wider text-center">Reservations</th>
                                                <th className="px-6 py-3 text-zayko-400 font-semibold text-xs uppercase tracking-wider text-right">Quantity to Buy</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {confirmedItems.map((item, idx) => (
                                                <tr key={item.itemId} className="border-b border-zayko-700/50 hover:bg-white/5 transition-colors">
                                                    <td className="px-6 py-3 text-zayko-600 font-medium">{idx + 1}</td>
                                                    <td className="px-6 py-3 text-white font-semibold">{item.itemName}</td>
                                                    <td className="px-6 py-3 text-center">
                                                        <span className="text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-400 font-bold">
                                                            {item.reservationCount} order{item.reservationCount !== 1 ? "s" : ""}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-3 text-right">
                                                        <span className="text-lg font-display font-bold text-emerald-400">{item.totalQuantity}</span>
                                                        <span className="text-xs text-zayko-500 ml-1.5">units</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="bg-zayko-800/80">
                                                <td className="px-6 py-3" colSpan={3}>
                                                    <span className="text-sm font-bold text-white">Total to Purchase</span>
                                                </td>
                                                <td className="px-6 py-3 text-right">
                                                    <span className="text-lg font-display font-bold text-white">{confirmedTotal}</span>
                                                    <span className="text-xs text-zayko-500 ml-1.5">units</span>
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}

                            <p className="text-[10px] text-zayko-600 mt-3 text-center">
                                ⚠️ Only confirmed demand is shown. Reserved/expired items are excluded to prevent over-ordering.
                            </p>
                        </div>

                        {/* ─── Today & Tomorrow Forecast ─── */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 animate-slide-up">
                            {/* Today */}
                            <div className="bg-zayko-800/50 border border-emerald-500/20 rounded-2xl p-5">
                                <div className="flex items-center gap-2 mb-4">
                                    <span className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center text-sm">📋</span>
                                    <div>
                                        <h3 className="text-sm font-display font-bold text-white">Today&apos;s Demand</h3>
                                        <p className="text-xs text-emerald-400">{data.summary.todayDay}</p>
                                    </div>
                                </div>
                                {Object.keys(data.todayForecast).length > 0 ? (
                                    <div className="space-y-1.5">
                                        {Object.entries(data.todayForecast)
                                            .sort((a, b) => b[1] - a[1])
                                            .map(([name, qty]) => (
                                                <div key={name} className="flex items-center justify-between py-1.5 px-3 bg-white/5 rounded-xl">
                                                    <span className="text-sm text-zayko-200">{name}</span>
                                                    <span className="text-sm font-bold text-emerald-400">{qty} units</span>
                                                </div>
                                            ))}
                                        <div className="flex items-center justify-between pt-2 mt-2 border-t border-zayko-700">
                                            <span className="text-xs font-semibold text-zayko-400">Total</span>
                                            <span className="text-sm font-bold text-white">
                                                {Object.values(data.todayForecast).reduce((s, v) => s + v, 0)} units
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-xs text-zayko-500 italic">No demand planned for today</p>
                                )}
                            </div>

                            {/* Tomorrow */}
                            <div className="bg-zayko-800/50 border border-blue-500/20 rounded-2xl p-5">
                                <div className="flex items-center gap-2 mb-4">
                                    <span className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center text-sm">📆</span>
                                    <div>
                                        <h3 className="text-sm font-display font-bold text-white">Tomorrow&apos;s Demand</h3>
                                        <p className="text-xs text-blue-400">{data.summary.tomorrowDay}</p>
                                    </div>
                                </div>
                                {Object.keys(data.tomorrowForecast).length > 0 ? (
                                    <div className="space-y-1.5">
                                        {Object.entries(data.tomorrowForecast)
                                            .sort((a, b) => b[1] - a[1])
                                            .map(([name, qty]) => (
                                                <div key={name} className="flex items-center justify-between py-1.5 px-3 bg-white/5 rounded-xl">
                                                    <span className="text-sm text-zayko-200">{name}</span>
                                                    <span className="text-sm font-bold text-blue-400">{qty} units</span>
                                                </div>
                                            ))}
                                        <div className="flex items-center justify-between pt-2 mt-2 border-t border-zayko-700">
                                            <span className="text-xs font-semibold text-zayko-400">Total</span>
                                            <span className="text-sm font-bold text-white">
                                                {Object.values(data.tomorrowForecast).reduce((s, v) => s + v, 0)} units
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-xs text-zayko-500 italic">No demand planned for tomorrow</p>
                                )}
                            </div>
                        </div>


                        {/* ─── Day-wise Purchase Requirement ─── */}
                        <div className="animate-slide-up">
                            {/* Day Selector */}
                            <div className="flex items-center gap-3 mb-5">
                                <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center text-sm">🛒</div>
                                <h3 className="text-base font-display font-bold text-white">Day-wise Purchase Requirement</h3>
                            </div>

                            <div className="flex flex-wrap gap-2 mb-6">
                                {ALL_DAYS.map((day) => (
                                    <button
                                        key={day}
                                        onClick={() => setSelectedPurchaseDay(day)}
                                        className={`px-5 py-3 rounded-2xl text-sm font-bold transition-all duration-200 ${selectedPurchaseDay === day
                                            ? "bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-500/25 scale-105"
                                            : "bg-zayko-800/50 text-zayko-400 border border-zayko-700 hover:text-white hover:bg-white/5 hover:border-zayko-600"
                                            }`}
                                    >
                                        {DAY_SHORT[day]}
                                        {selectedPurchaseDay === day && (
                                            <span className="ml-1.5 text-emerald-200/70 text-xs">●</span>
                                        )}
                                    </button>
                                ))}
                            </div>

                            {/* Purchase Summary Card */}
                            <div className="bg-gradient-to-br from-blue-500/10 to-indigo-500/5 border border-blue-500/20 rounded-2xl p-5 mb-6">
                                <h4 className="text-sm font-display font-bold text-white mb-1">
                                    {selectedPurchaseDay} Purchase Summary
                                </h4>
                                <p className="text-[10px] text-blue-400 uppercase tracking-wider font-bold mb-4">Based on real user demand</p>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-white/5 rounded-xl p-4 text-center">
                                        <p className="text-3xl font-display font-bold text-emerald-400">{dayDemandItems.length}</p>
                                        <p className="text-[10px] text-zayko-400 uppercase tracking-wider font-bold mt-1">Unique Items</p>
                                    </div>
                                    <div className="bg-white/5 rounded-xl p-4 text-center">
                                        <p className="text-3xl font-display font-bold text-blue-400">{dayTotalQuantity}</p>
                                        <p className="text-[10px] text-zayko-400 uppercase tracking-wider font-bold mt-1">Total Quantity</p>
                                    </div>
                                </div>
                            </div>

                            {/* Purchase Items Table */}
                            {dayDemandItems.length === 0 ? (
                                <div className="bg-zayko-800/30 border border-zayko-700 rounded-2xl p-12 text-center">
                                    <div className="text-4xl mb-3">📭</div>
                                    <p className="text-zayko-400 font-medium">No items required for {selectedPurchaseDay}</p>
                                    <p className="text-xs text-zayko-600 mt-1">Items will appear here when users add demand for this day</p>
                                </div>
                            ) : (
                                <div className="bg-zayko-800/50 border border-zayko-700 rounded-2xl overflow-hidden">
                                    <table className="w-full text-sm text-left">
                                        <thead>
                                            <tr className="border-b border-zayko-700 bg-zayko-800/50">
                                                <th className="px-6 py-4 text-zayko-400 font-semibold text-xs uppercase tracking-wider">#</th>
                                                <th className="px-6 py-4 text-zayko-400 font-semibold text-xs uppercase tracking-wider">Item</th>
                                                <th className="px-6 py-4 text-zayko-400 font-semibold text-xs uppercase tracking-wider text-right">
                                                    Quantity to Purchase <span className="text-zayko-600">(for {DAY_SHORT[selectedPurchaseDay]})</span>
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {dayDemandItems.map((item, idx) => (
                                                <tr
                                                    key={item.itemName}
                                                    className="border-b border-zayko-700/50 hover:bg-white/5 transition-colors"
                                                >
                                                    <td className="px-6 py-4 text-zayko-600 font-medium">{idx + 1}</td>
                                                    <td className="px-6 py-4 text-white font-semibold">{item.itemName}</td>
                                                    <td className="px-6 py-4 text-right">
                                                        <span className="text-lg font-display font-bold text-emerald-400">
                                                            {item.requiredQuantity}
                                                        </span>
                                                        <span className="text-xs text-zayko-500 ml-1.5">units</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="bg-zayko-800/80">
                                                <td className="px-6 py-4" colSpan={2}>
                                                    <span className="text-sm font-bold text-white">Total</span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <span className="text-lg font-display font-bold text-white">
                                                        {dayTotalQuantity}
                                                    </span>
                                                    <span className="text-xs text-zayko-500 ml-1.5">units</span>
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
