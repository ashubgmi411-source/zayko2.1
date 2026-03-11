/**
 * UserThemeWrapper — Client component that conditionally applies
 * ThemeProvider only on user routes (not admin/stock/executive).
 *
 * This ensures the multi-theme system never affects admin dashboards.
 */

"use client";
import React, { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ThemeProvider } from "@/context/ThemeContext";
import ThemeToggle from "@/components/ui/ThemeToggle";
import ThemePanel from "@/components/ui/ThemePanel";
import "@/styles/themes.css";

const EXCLUDED_PREFIXES = ["/admin", "/stock", "/executive"];

export default function UserThemeWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const isExcluded = EXCLUDED_PREFIXES.some((prefix) =>
    pathname?.startsWith(prefix)
  );

  // Admin / Stock / Executive — render children without theme wrapper
  if (isExcluded) {
    return <>{children}</>;
  }

  // User routes — apply theme system
  return (
    <ThemeProvider>
      {children}
      <ThemeToggle />
      <ThemePanel />
    </ThemeProvider>
  );
}
