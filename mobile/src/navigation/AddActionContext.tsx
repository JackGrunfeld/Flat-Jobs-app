import React, { createContext, useCallback, useContext, useEffect, useRef } from "react";
import type { MainTabParamList } from "./MainTabNavigator";

export type AddActionRoute = keyof MainTabParamList;

type AddActionContextValue = {
  registerAddAction: (route: AddActionRoute, handler: () => void) => () => void;
  runAddAction: (route: AddActionRoute) => void;
};

const AddActionContext = createContext<AddActionContextValue | null>(null);

// The "+" lives in the tab bar but each add form belongs to its own screen —
// the screen owns the data it writes and the reload afterwards. This is the
// bridge: screens register what "+" should do for their tab, the bar fires it.
export function AddActionProvider({ children }: { children: React.ReactNode }) {
  const handlers = useRef(new Map<AddActionRoute, () => void>());
  // Tab screens mount lazily, so the radial menu can navigate to a tab that
  // has never been opened and fire before its handler exists. Holding the
  // request here lets the screen pick it up the moment it registers —
  // otherwise the first use of each menu item silently does nothing.
  const pending = useRef<AddActionRoute | null>(null);

  const registerAddAction = useCallback((route: AddActionRoute, handler: () => void) => {
    handlers.current.set(route, handler);
    if (pending.current === route) {
      pending.current = null;
      // After paint, so the screen that's registering is on screen before its
      // modal opens over it.
      requestAnimationFrame(handler);
    }
    return () => {
      if (handlers.current.get(route) === handler) handlers.current.delete(route);
    };
  }, []);

  const runAddAction = useCallback((route: AddActionRoute) => {
    const handler = handlers.current.get(route);
    if (handler) handler();
    else pending.current = route;
  }, []);

  return (
    <AddActionContext.Provider value={{ registerAddAction, runAddAction }}>{children}</AddActionContext.Provider>
  );
}

export function useAddAction(): AddActionContextValue {
  const ctx = useContext(AddActionContext);
  if (!ctx) throw new Error("useAddAction must be used within an AddActionProvider");
  return ctx;
}

// Sugar for the screen side: register on mount, clean up on unmount. `handler`
// is held in a ref so a screen can pass an inline arrow without re-registering
// on every render.
export function useRegisterAddAction(route: AddActionRoute, handler: () => void) {
  const { registerAddAction } = useAddAction();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => registerAddAction(route, () => handlerRef.current()), [registerAddAction, route]);
}
