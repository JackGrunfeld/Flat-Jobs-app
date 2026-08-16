import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { accentedPalette } from "../theme/colors";
import type { ColorScheme, ThemeColors } from "../theme/colors";
import { getThemeScheme, setThemeScheme } from "../storage/preferences";
import { useAuth } from "./AuthContext";

type ThemeContextValue = {
  scheme: ColorScheme;
  colors: ThemeColors;
  setScheme: (scheme: ColorScheme) => void;
  toggleScheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Starts on light (the app's default) and swaps in the saved choice once
// AsyncStorage resolves — so the overwhelmingly common "never touched the
// toggle" case never flashes the other scheme on cold start.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [scheme, setSchemeState] = useState<ColorScheme>("light");
  const { currentUser, userFlat } = useAuth();

  // The colour picked on Settings is the app's accent, so it comes from the
  // member record rather than a second stored copy — one source of truth, and
  // it follows the user onto another device without a sync step. Signed out
  // (or colour never set), the palette's own accent stands in.
  const memberColor =
    userFlat?.members.find((m) => m.userId === currentUser?.id)?.color ?? null;

  useEffect(() => {
    getThemeScheme().then(setSchemeState);
  }, []);

  const setScheme = useCallback((next: ColorScheme) => {
    setSchemeState(next);
    setThemeScheme(next);
  }, []);

  const toggleScheme = useCallback(() => {
    setSchemeState((prev) => {
      const next: ColorScheme = prev === "dark" ? "light" : "dark";
      setThemeScheme(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ scheme, colors: accentedPalette(scheme, memberColor), setScheme, toggleScheme }),
    [scheme, memberColor, setScheme, toggleScheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
