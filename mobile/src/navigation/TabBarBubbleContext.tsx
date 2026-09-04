import React, { createContext, useCallback, useContext, useState } from "react";

export type TabBarBubbleState = { message: string; onPress: () => void } | null;

type TabBarBubbleContextValue = {
  bubble: TabBarBubbleState;
  showBubble: (message: string, onPress: () => void) => void;
  hideBubble: () => void;
};

const TabBarBubbleContext = createContext<TabBarBubbleContextValue | null>(null);

// A single parking spot for a "nudge" bubble above the tab bar's "+" — the
// bar owns the button's real on-screen position, so this is the same bridge
// pattern as AddActionContext, just carrying a bubble to show instead of a
// request to run. Only one bubble shows at a time; a screen showing a new one
// replaces whatever was there, and a screen should hide its own bubble when
// the condition that raised it no longer holds (or it loses focus).
export function TabBarBubbleProvider({ children }: { children: React.ReactNode }) {
  const [bubble, setBubble] = useState<TabBarBubbleState>(null);

  const showBubble = useCallback((message: string, onPress: () => void) => {
    setBubble({ message, onPress });
  }, []);
  const hideBubble = useCallback(() => setBubble(null), []);

  return (
    <TabBarBubbleContext.Provider value={{ bubble, showBubble, hideBubble }}>
      {children}
    </TabBarBubbleContext.Provider>
  );
}

export function useTabBarBubble(): TabBarBubbleContextValue {
  const ctx = useContext(TabBarBubbleContext);
  if (!ctx) throw new Error("useTabBarBubble must be used within a TabBarBubbleProvider");
  return ctx;
}
