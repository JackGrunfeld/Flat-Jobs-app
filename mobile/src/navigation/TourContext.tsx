import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { MainTabParamList } from "./MainTabNavigator";
import type { RootStackParamList } from "./AppNavigator";
import { ANGLES as RADIAL_ANGLES, BUBBLE as RADIAL_BUBBLE, RADIAL_ITEMS, RADIUS as RADIAL_RADIUS } from "../components/RadialAddMenu";

// Every on-screen thing the tour can point at. Tab keys line up with
// MainTabParamList's route names — "tab-Home" is deliberately left out, the
// dashboard doesn't get its own stop. The "radial-*" keys are the Home tab's
// "+" fan-out items (see RADIAL_ITEMS) — their position isn't registered by
// anything, it's computed from "plus-button" once that's known (see
// computeRadialTargets below), since the fan positions its bubbles with a
// transform that plain layout measurement can't see through. The
// "settings-*" keys are tiles on the Home Hub (Settings) screen itself — see
// SettingsScreen, which scrolls to and measures each in turn.
export type TourTargetKey =
  | "tab-House"
  | "tab-Shopping"
  | "tab-Bills"
  | "plus-button"
  | "settings-button"
  | "radial-House"
  | "radial-Shopping"
  | "radial-Bills"
  | "radial-Home"
  | "settings-homeInfo"
  | "settings-homies"
  | "settings-me";

// A target's own position and size in window coordinates — what
// `measureInWindow` reports, which is what a full-screen absolute overlay
// needs to line up a highlight ring against it.
export type TourRect = { x: number; y: number; width: number; height: number };

export type TourStep = {
  target: TourTargetKey;
  // Tab to switch to before this step shows, if it isn't already showing.
  // Ignored once `screen` is "Settings" — there's no tab bar there.
  route?: keyof MainTabParamList;
  // Which stack screen this step belongs on. Defaults to "Tabs" — only the
  // Home Hub steps at the end set this to "Settings".
  screen?: keyof RootStackParamList;
  // Whether the Home tab's "+" fan should be open for this step — set on
  // every "radial-*" step and nothing else, so the fan opens right as the
  // walkthrough reaches its first item and folds back up once it's done
  // with the last.
  openRadial?: boolean;
  // "circle" (the default) rings a small round target — a tab icon, a fan
  // bubble, the settings avatar — with a pill. "box" outlines a target's own
  // rectangle instead, for the Home Hub's tiles, which are wide rows rather
  // than small round buttons and read oddly forced into a circle.
  shape?: "circle" | "box";
  message: string;
};

// The walkthrough itself. Starts right on Home with the "+" — pointed out,
// then opened, with each of its four items getting its own stop (Event, the
// calendar entry, first, then Chore, Shopping and Expense) — before folding
// away and moving on to House → Shopping → Bills for what each tab itself is
// for, and finishing on the settings avatar.
export const TOUR_STEPS: TourStep[] = [
  {
    target: "plus-button",
    route: "Home",
    message: "Tap '+' any time to add something — let's see what it can do.",
  },
  {
    target: "radial-Home",
    route: "Home",
    openRadial: true,
    message: "'Event' adds something to the calendar — a bill's due date, a party, whatever's coming up.",
  },
  {
    target: "radial-House",
    route: "Home",
    openRadial: true,
    message: "'Chore' adds a job to the roster for someone to tick off.",
  },
  {
    target: "radial-Shopping",
    route: "Home",
    openRadial: true,
    message: "'Shopping' drops something straight onto the flat's shared list.",
  },
  {
    target: "radial-Bills",
    route: "Home",
    openRadial: true,
    message: "'Expense' logs a shared cost and works out who owes what.",
  },
  {
    target: "tab-House",
    route: "House",
    message: "'House' is where chores live — see what's assigned and tick them off as you go.",
  },
  {
    target: "tab-Shopping",
    route: "Shopping",
    message: "'Shopping' is the flat's shared list — pop something on it whenever you notice it's running low.",
  },
  {
    target: "tab-Bills",
    route: "Bills",
    message: "'Bills' keeps track of who's owed what, so splitting shared costs stays simple.",
  },
  {
    target: "settings-button",
    message: "Your profile and flat settings live behind your avatar up here.",
  },
  {
    target: "settings-homeInfo",
    screen: "Settings",
    shape: "box",
    message: "'Home Info' is where your address, wifi and landlord's contact live — fill it in so everyone in the flat can look them up.",
  },
  {
    target: "settings-homies",
    screen: "Settings",
    shape: "box",
    message: "'Homies' has your flat's join code and an easy way to invite whoever else is moving in.",
  },
  {
    target: "settings-me",
    screen: "Settings",
    shape: "box",
    message: "'Me' is your own profile — name, photo and colour, so flatmates know which avatar is you.",
  },
];

// The fan positions each bubble with rotate + translateX + scale, none of
// which plain layout measurement can see — RN's measure functions report
// the pre-transform frame. So this works out the same arc the component
// itself draws (see RadialAddMenu), given the "+" button's own measured
// centre, rather than trying to measure a bubble that's only ever
// mid-animation.
function computeRadialTargets(plusCentre: { x: number; y: number }): Partial<Record<TourTargetKey, TourRect>> {
  const out: Partial<Record<TourTargetKey, TourRect>> = {};
  RADIAL_ITEMS.forEach((item, index) => {
    const angleRad = (RADIAL_ANGLES[index] * Math.PI) / 180;
    const dx = -RADIAL_RADIUS * Math.cos(angleRad);
    const dy = -RADIAL_RADIUS * Math.sin(angleRad);
    const key = `radial-${item.route}` as TourTargetKey;
    out[key] = {
      x: plusCentre.x + dx - RADIAL_BUBBLE / 2,
      y: plusCentre.y + dy - RADIAL_BUBBLE / 2,
      width: RADIAL_BUBBLE,
      height: RADIAL_BUBBLE,
    };
  });
  return out;
}

type TourContextValue = {
  active: boolean;
  stepIndex: number;
  step: TourStep | null;
  targets: Partial<Record<TourTargetKey, TourRect>>;
  // Whether the Home tab's "+" fan should currently be forced open — FlatTabBar
  // ORs this into RadialAddMenu's own `visible` prop.
  radialOpen: boolean;
  registerTarget: (key: TourTargetKey, rect: TourRect) => void;
  setTabNavigator: (nav: BottomTabNavigationProp<MainTabParamList> | null) => void;
  // The root stack's own navigation — only needed for the Home Hub steps at
  // the end, which have to push onto "Settings" rather than switch tabs.
  setRootNavigator: (nav: NativeStackNavigationProp<RootStackParamList> | null) => void;
  start: () => void;
  next: () => void;
  skip: () => void;
};

const TourContext = createContext<TourContextValue | null>(null);

// Bridges the guided walkthrough to whatever it needs to point at — the tab
// bar's icons and "+" register their own on-screen position here (see
// FlatTabBar), the settings avatar does the same (see SettingsButton), and
// the overlay that actually draws the tour (TourOverlay) just reads
// `step`/`targets` back out. `onFinish` is how the caller persists "seen" —
// kept outside this provider since that's per-account storage, not tour
// state.
export function TourProvider({ children, onFinish }: { children: React.ReactNode; onFinish: () => void }) {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [radialOpen, setRadialOpen] = useState(false);
  const [targets, setTargets] = useState<Partial<Record<TourTargetKey, TourRect>>>({});
  const tabNavRef = useRef<BottomTabNavigationProp<MainTabParamList> | null>(null);
  const rootNavRef = useRef<NativeStackNavigationProp<RootStackParamList> | null>(null);

  const registerTarget = useCallback((key: TourTargetKey, rect: TourRect) => {
    setTargets((prev) => {
      const existing = prev[key];
      if (
        existing &&
        existing.x === rect.x &&
        existing.y === rect.y &&
        existing.width === rect.width &&
        existing.height === rect.height
      ) {
        return prev;
      }
      return { ...prev, [key]: rect };
    });
  }, []);

  // The four fan positions ride entirely off the "+" button's own measured
  // centre — recomputed whenever that moves (rotation, a different device),
  // never registered by anything directly.
  const plusRect = targets["plus-button"];
  useEffect(() => {
    if (!plusRect) return;
    const computed = computeRadialTargets({ x: plusRect.x + plusRect.width / 2, y: plusRect.y + plusRect.height / 2 });
    setTargets((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [key, rect] of Object.entries(computed) as [TourTargetKey, TourRect][]) {
        const existing = prev[key];
        if (!existing || existing.x !== rect.x || existing.y !== rect.y) {
          next[key] = rect;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [plusRect]);

  const setTabNavigator = useCallback((nav: BottomTabNavigationProp<MainTabParamList> | null) => {
    tabNavRef.current = nav;
  }, []);

  const setRootNavigator = useCallback((nav: NativeStackNavigationProp<RootStackParamList> | null) => {
    rootNavRef.current = nav;
  }, []);

  const goToStep = useCallback((index: number) => {
    const step = TOUR_STEPS[index];
    if (step?.screen === "Settings") {
      // A no-op once already there — react-navigation just re-focuses the
      // existing route rather than pushing a second copy.
      rootNavRef.current?.navigate("Settings");
    } else {
      rootNavRef.current?.navigate("Tabs");
      if (step?.route) tabNavRef.current?.navigate(step.route);
    }
    setRadialOpen(!!step?.openRadial);
    setStepIndex(index);
  }, []);

  const start = useCallback(() => {
    setActive(true);
    goToStep(0);
  }, [goToStep]);

  const finish = useCallback(() => {
    setActive(false);
    setRadialOpen(false);
    onFinish();
  }, [onFinish]);

  const next = useCallback(() => {
    const nextIndex = stepIndex + 1;
    if (nextIndex >= TOUR_STEPS.length) finish();
    else goToStep(nextIndex);
  }, [stepIndex, goToStep, finish]);

  const skip = useCallback(() => finish(), [finish]);

  const value = useMemo<TourContextValue>(
    () => ({
      active,
      stepIndex,
      step: active ? (TOUR_STEPS[stepIndex] ?? null) : null,
      targets,
      radialOpen: active && radialOpen,
      registerTarget,
      setTabNavigator,
      setRootNavigator,
      start,
      next,
      skip,
    }),
    [active, stepIndex, targets, radialOpen, registerTarget, setTabNavigator, setRootNavigator, start, next, skip],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within a TourProvider");
  return ctx;
}
