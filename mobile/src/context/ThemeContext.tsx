import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { paletteFor } from "../theme/colors";
import type { ColorScheme, ThemeColors } from "../theme/colors";
import { getThemeScheme, setThemeScheme } from "../storage/preferences";

type ThemeContextValue = {
  scheme: ColorScheme;
  colors: ThemeColors;
  setScheme: (scheme: ColorScheme) => void;
  toggleScheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Starts on dark (the app's original look) and swaps in the saved choice once
// AsyncStorage resolves — so the overwhelmingly common "never touched the
// toggle" case never flashes light on cold start.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [scheme, setSchemeState] = useState<ColorScheme>("dark");

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
    () => ({ scheme, colors: paletteFor(scheme), setScheme, toggleScheme }),
    [scheme, setScheme, toggleScheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
