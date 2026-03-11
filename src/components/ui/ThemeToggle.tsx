/**
 * ThemeToggle — Floating theme switcher button
 *
 * Positioned at bottom-right, above mobile nav.
 * Opens the ThemePanel on click. Shows current theme icon.
 */

"use client";
import React from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

export default function ThemeToggle() {
  const { themeConfig, togglePanel } = useTheme();

  return (
    <motion.button
      onClick={togglePanel}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 20, delay: 0.5 }}
      whileHover={{ scale: 1.12, rotate: 15 }}
      whileTap={{ scale: 0.9 }}
      className="fixed bottom-24 md:bottom-6 right-4 z-[45] w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-lg border cursor-pointer"
      style={{
        background: "var(--theme-glass-bg)",
        borderColor: "var(--theme-glass-border)",
        backdropFilter: "var(--theme-glass-blur)",
        WebkitBackdropFilter: "var(--theme-glass-blur)",
        boxShadow: "var(--theme-shadow-card)",
      }}
      aria-label={`Current theme: ${themeConfig.name}. Click to change.`}
      title="Change Theme"
    >
      <motion.span
        key={themeConfig.id}
        initial={{ rotate: -180, scale: 0 }}
        animate={{ rotate: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 20 }}
      >
        {themeConfig.icon}
      </motion.span>

      {/* Subtle pulse ring */}
      <motion.div
        className="absolute inset-0 rounded-2xl"
        style={{ border: `1px solid var(--theme-accent-primary)` }}
        animate={{ scale: [1, 1.25, 1], opacity: [0.4, 0, 0.4] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
    </motion.button>
  );
}
