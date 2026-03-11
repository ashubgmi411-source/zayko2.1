/**
 * ThemePanel — Premium slide-in theme switcher panel
 *
 * Features:
 * - 6 theme preview cards with color swatches
 * - Glassmorphism backdrop
 * - Auto-theme toggle
 * - Animated entry/exit via Framer Motion
 * - Keyboard accessible (Escape to close)
 */

"use client";
import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme, THEMES, type ThemeConfig } from "@/context/ThemeContext";

// ── Theme Card ───────────────────────────────────────────
function ThemeCard({ config, isActive, onSelect }: {
  config: ThemeConfig;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <motion.button
      onClick={onSelect}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      className={`relative w-full p-3.5 rounded-2xl border text-left transition-all duration-300 cursor-pointer group overflow-hidden ${
        isActive
          ? "ring-2 ring-offset-0"
          : "hover:border-opacity-40"
      }`}
      style={{
        background: config.colors.primary,
        borderColor: isActive ? config.colors.accent : `${config.colors.accent}25`,
        boxShadow: isActive ? `0 0 0 2px ${config.colors.accent}` : undefined,
      }}
      aria-label={`Select ${config.name} theme`}
      aria-pressed={isActive}
    >
      {/* Color palette preview */}
      <div className="flex gap-1.5 mb-3">
        {Object.values(config.colors).map((color, i) => (
          <motion.div
            key={i}
            className="w-5 h-5 rounded-lg border border-white/10"
            style={{ backgroundColor: color }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: i * 0.05, type: "spring", stiffness: 500, damping: 25 }}
          />
        ))}
      </div>

      {/* Theme info */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base">{config.icon}</span>
            <span
              className="text-sm font-bold"
              style={{ color: isActive ? config.colors.accent : "#e2e8f0" }}
            >
              {config.name}
            </span>
          </div>
          <p className="text-[10px] mt-0.5 opacity-50" style={{ color: "#94a3b8" }}>
            {config.description}
          </p>
        </div>

        {/* Active indicator */}
        <AnimatePresence>
          {isActive && (
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 180 }}
              transition={{ type: "spring", stiffness: 500, damping: 25 }}
              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px]"
              style={{ backgroundColor: config.colors.accent, color: config.colors.primary }}
            >
              ✓
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Hover glow */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 100%, ${config.colors.accent}12, transparent 70%)`,
        }}
      />
    </motion.button>
  );
}

// ── Main Panel ───────────────────────────────────────────
export default function ThemePanel() {
  const { theme, setTheme, isPanelOpen, closePanel, autoTheme, setAutoTheme } = useTheme();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!isPanelOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPanelOpen, closePanel]);

  // Close on outside click
  useEffect(() => {
    if (!isPanelOpen) return;

    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        closePanel();
      }
    };

    // Delay to avoid immediate close from toggle button click
    const timer = setTimeout(() => {
      window.addEventListener("mousedown", handleClick);
    }, 100);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousedown", handleClick);
    };
  }, [isPanelOpen, closePanel]);

  return (
    <AnimatePresence>
      {isPanelOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[48] bg-black/40 backdrop-blur-sm"
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 350, damping: 32 }}
            className="fixed top-0 right-0 bottom-0 z-[49] w-[340px] max-w-[90vw] overflow-y-auto"
            style={{
              background: "var(--theme-bg-secondary)",
              borderLeft: "1px solid var(--theme-border)",
              boxShadow: "-8px 0 40px rgba(0, 0, 0, 0.3)",
            }}
            role="dialog"
            aria-label="Theme Switcher"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 px-5 pt-6 pb-4" style={{ background: "var(--theme-bg-secondary)" }}>
              <div className="flex items-center justify-between mb-1">
                <motion.h2
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="text-lg font-bold"
                  style={{ color: "var(--theme-text-heading)", fontFamily: "'Outfit', sans-serif" }}
                >
                  🎨 Themes
                </motion.h2>
                <motion.button
                  onClick={closePanel}
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-sm transition-colors cursor-pointer"
                  style={{
                    background: "var(--theme-bg-input)",
                    color: "var(--theme-text-muted)",
                  }}
                  aria-label="Close theme panel"
                >
                  ✕
                </motion.button>
              </div>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-xs"
                style={{ color: "var(--theme-text-muted)" }}
              >
                Choose your visual experience
              </motion.p>
            </div>

            {/* Theme Grid */}
            <div className="px-5 pb-4">
              <motion.div
                className="grid grid-cols-1 gap-3"
                initial="hidden"
                animate="show"
                variants={{
                  hidden: { opacity: 0 },
                  show: {
                    opacity: 1,
                    transition: { staggerChildren: 0.06, delayChildren: 0.2 },
                  },
                }}
              >
                {THEMES.map((t) => (
                  <motion.div
                    key={t.id}
                    variants={{
                      hidden: { opacity: 0, x: 30 },
                      show: { opacity: 1, x: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
                    }}
                  >
                    <ThemeCard
                      config={t}
                      isActive={theme === t.id}
                      onSelect={() => setTheme(t.id)}
                    />
                  </motion.div>
                ))}
              </motion.div>
            </div>

            {/* Divider */}
            <div
              className="mx-5 h-px"
              style={{ background: "var(--theme-border)" }}
            />

            {/* Auto Theme Toggle */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="px-5 py-5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--theme-text-primary)" }}>
                    ⏰ Auto Theme
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: "var(--theme-text-muted)" }}>
                    Light by day, Dark by night
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={autoTheme}
                    onChange={(e) => setAutoTheme(e.target.checked)}
                  />
                  <div
                    className="w-10 h-5.5 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4.5 after:w-4.5 after:transition-all"
                    style={{
                      backgroundColor: autoTheme ? "var(--theme-accent-primary)" : "var(--theme-bg-input)",
                      border: `1px solid ${autoTheme ? "transparent" : "var(--theme-border)"}`,
                    }}
                  />
                </label>
              </div>
            </motion.div>

            {/* Footer */}
            <div className="px-5 pb-8">
              <div
                className="rounded-xl p-3 text-center"
                style={{
                  background: "var(--theme-bg-input)",
                  border: "1px solid var(--theme-border)",
                }}
              >
                <p className="text-[10px] font-medium" style={{ color: "var(--theme-text-muted)" }}>
                  Themes apply only to your view ✨
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
