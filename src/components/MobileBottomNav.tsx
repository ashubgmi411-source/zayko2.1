/**
 * MobileBottomNav — Premium floating bottom navigation.
 * Shows: Menu | Orders | Wallet | Profile
 * Hidden on desktop (md+) and admin/stock routes.
 */

"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { motion, AnimatePresence } from "framer-motion";

// Safe theme hook that doesn't throw if ThemeProvider isn't wrapping this
import { useTheme as useThemeRaw } from "@/context/ThemeContext";

function useSafeTheme() {
    try {
        return useThemeRaw();
    } catch {
        return null;
    }
}

export default function MobileBottomNav() {
    const pathname = usePathname();
    const { user } = useAuth();
    const { itemCount } = useCart();
    const themeCtx = useSafeTheme();

    const navItems = [
        { href: "/", label: "Menu", icon: "🍽️" },
        { href: "/orders", label: "Orders", icon: "📋" },
        { href: "/wallet", label: "Wallet", icon: "💰" },
        { href: "/profile", label: "Profile", icon: "👤" },
    ];

    if (!user) return null;
    if (pathname?.startsWith("/admin")) return null;
    if (pathname?.startsWith("/stock")) return null;
    if (pathname?.startsWith("/executive")) return null;
    if (pathname?.startsWith("/auth")) return null;

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden px-3 pb-2">
            {/* Premium glass container */}
            <div className="premium-bottom-nav overflow-hidden">
                <div className="grid grid-cols-5 px-2 py-1 relative">
                    {navItems.map((item) => {
                        const isActive = item.href === "/"
                            ? pathname === "/"
                            : pathname?.startsWith(item.href);

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex flex-col items-center gap-0.5 py-2.5 px-1 rounded-xl transition-all duration-300 relative ${isActive
                                        ? "text-gold-400"
                                        : "text-zayko-500 active:scale-90"
                                    }`}
                            >
                                {/* Active indicator bar */}
                                {isActive && (
                                    <motion.div
                                        layoutId="mobile-nav-indicator"
                                        className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-gradient-to-r from-gold-400 to-gold-500 shadow-[0_2px_12px_rgba(251,191,36,0.5)]"
                                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                    />
                                )}

                                {/* Active glow bg */}
                                {isActive && (
                                    <motion.div
                                        layoutId="mobile-nav-bg"
                                        className="absolute inset-1 rounded-xl bg-gold-400/[0.06]"
                                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                    />
                                )}

                                <motion.span
                                    className={`text-lg relative z-10`}
                                    animate={isActive ? { scale: 1.15 } : { scale: 1 }}
                                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                >
                                    {item.icon}
                                    {/* Cart badge */}
                                    <AnimatePresence>
                                        {item.href === "/" && itemCount > 0 && (
                                            <motion.span
                                                initial={{ scale: 0 }}
                                                animate={{ scale: 1 }}
                                                exit={{ scale: 0 }}
                                                transition={{ type: "spring", stiffness: 500, damping: 20 }}
                                                className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 bg-gradient-to-br from-red-500 to-red-600 text-white text-[8px] rounded-full flex items-center justify-center font-bold shadow-lg shadow-red-500/30 px-0.5"
                                            >
                                                {itemCount > 9 ? "9+" : itemCount}
                                            </motion.span>
                                        )}
                                    </AnimatePresence>
                                </motion.span>

                                <span className={`text-[10px] font-semibold relative z-10 transition-colors duration-200 ${isActive ? "text-gold-400" : "text-zayko-500"
                                    }`}>
                                    {item.label}
                                </span>
                            </Link>
                        );
                    })}

                    {/* Theme Tab */}
                    {themeCtx && (
                        <button
                            onClick={themeCtx.togglePanel}
                            className="flex flex-col items-center gap-0.5 py-2.5 px-1 rounded-xl transition-all duration-300 text-zayko-500 active:scale-90"
                        >
                            <motion.span
                                className="text-lg relative z-10"
                                whileTap={{ scale: 0.9, rotate: 20 }}
                            >
                                {themeCtx.themeConfig.icon}
                            </motion.span>
                            <span className="text-[10px] font-semibold relative z-10 text-zayko-500">Theme</span>
                        </button>
                    )}
                </div>

                {/* iPhone safe area */}
                <div className="h-[env(safe-area-inset-bottom)]" />
            </div>
        </nav>
    );
}
