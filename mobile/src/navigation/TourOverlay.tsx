import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fonts } from "../theme/fonts";
import { LOGIN_ACCENT, onColor } from "../theme/colors";
import { DECOR } from "../components/ThoughtBubble";
import { TOUR_STEPS, useTour } from "./TourContext";

// The same fixed purple the sign-up flow uses (AuthScreen, ProfileSetupScreen,
// FlatSetupScreen) — deliberately not `colors.accent`, which shifts to blue
// in light mode and would read as an unrelated system rather than the same
// one carrying through from signup into the walkthrough.
const PURPLE = LOGIN_ACCENT;
const PURPLE_FG = onColor(PURPLE);

// Breathing room between the highlight ring and the target's own edge.
const RING_PAD = 8;
// Wider padding for a "box" ring (the Home Hub's tiles) — those are wide,
// low rows rather than small round buttons, so the same 8px reads as barely
// there once it's stretched around something that shape.
const RING_PAD_BOX = 10;
// Gap between the ring and whichever side the message bubble sits on.
const BUBBLE_GAP = 18;
const BUBBLE_MAX_WIDTH = 300;
// A small side-to-side nudge per step, cycling through this list by index —
// keeps consecutive bubbles from landing in exactly the same spot on screen.
// Safe against the wrap's own 20px side inset (see bubbleWrap), so nothing
// clips even at the extremes.
const BUBBLE_JITTER_X = [0, -16, 16, -10, 10, 0, -14, 14, 0, -12, 12, 0];

// Sits on top of the whole tab flow (mounted once from MainTabNavigator,
// beside FlatTabBar and TabsHeader, and again from SettingsScreen for the
// Home Hub steps) and draws whatever `useTour` says the current step is: a
// dimmed backdrop, a ring around the live target's measured position, and a
// message bubble — the same scalloped speech-bubble shape as ThoughtBubble
// (the shopping list's own nudge), reusing its DECOR bumps rather than a
// plain rounded rect — with progress, Skip and Next. Tapping anywhere —
// backdrop, ring or bubble — advances, matching the "tap through" pace the
// walkthrough is meant to run at.
export default function TourOverlay() {
  const { active, step, stepIndex, targets, next, skip } = useTour();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  // TourOverlay is mounted once per stack screen it might need to draw on
  // (Tabs and Settings both render one) — the stack keeps both mounted at
  // once, so this is what stops the off-screen copy from also drawing its
  // own backdrop/ring on top of whichever one is actually visible.
  const isFocused = useIsFocused();

  const enter = useRef(new Animated.Value(0)).current;
  const rect = step ? targets[step.target] : undefined;

  useEffect(() => {
    if (!active || !rect) return;
    enter.setValue(0);
    Animated.timing(enter, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    // Re-plays on every step, not just on mount — `rect` changes identity
    // each time a new step's target resolves.
  }, [active, rect, enter]);

  // Nothing to show yet — either the tour isn't running, this screen isn't
  // the focused one, or the step just changed and its target hasn't reported
  // a measurement back this frame. The last case clears itself as soon as
  // registerTarget fires.
  if (!active || !isFocused || !step || !rect) return null;

  const isBox = step.shape === "box";
  const pad = isBox ? RING_PAD_BOX : RING_PAD;
  const ring = {
    left: rect.x - pad,
    top: rect.y - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };

  // Bubble goes below the ring unless the ring sits low enough on screen
  // that there isn't room, in which case it goes above instead.
  const showBelow = ring.top + ring.height + 170 < height - insets.bottom;
  const isLast = stepIndex === TOUR_STEPS.length - 1;
  const jitterX = BUBBLE_JITTER_X[stepIndex % BUBBLE_JITTER_X.length];

  return (
    // zIndex here has to clear both TabsHeader (5) and SettingsButton (10) —
    // being last in the tree isn't enough on its own, since RN stacks
    // siblings by explicit zIndex first and paint order only as a tiebreak,
    // so without this the overlay was drawing underneath the header instead
    // of over it.
    <View style={[StyleSheet.absoluteFill, styles.root]} pointerEvents="box-none">
      <Pressable
        style={[StyleSheet.absoluteFill, styles.backdrop]}
        onPress={next}
        accessibilityLabel="Continue walkthrough"
      />

      <Animated.View
        pointerEvents="none"
        style={[
          styles.ring,
          ring,
          {
            // A pill for a small round target (tab icon, fan bubble, the
            // settings avatar); a modest rounded-rect for a "box" target — the
            // Home Hub's tiles read as boxes, so the outline should too,
            // rather than being squashed into an oval around a wide row.
            borderRadius: isBox ? 20 : Math.min(ring.width, ring.height) / 2,
            opacity: enter,
            transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
          },
        ]}
      />

      <Animated.View
        style={[
          styles.bubbleWrap,
          showBelow ? { top: ring.top + ring.height + BUBBLE_GAP } : { bottom: height - ring.top + BUBBLE_GAP },
          {
            opacity: enter,
            transform: [
              { translateX: jitterX },
              { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [showBelow ? -8 : 8, 0] }) },
            ],
          },
        ]}
        pointerEvents="box-none"
      >
        <Pressable style={styles.bubble} onPress={next}>
          {/* Fused to the bubble's own edges, same as ThoughtBubble — bumps
              of the bubble's own colour sitting just past its rounded-rect
              border, which is what reads as a scalloped cloud rather than a
              plain box. */}
          {DECOR.map((d, i) => (
            <View
              key={i}
              pointerEvents="none"
              style={[
                styles.decor,
                {
                  top: d.top,
                  bottom: d.bottom,
                  left: d.left,
                  right: d.right,
                  width: d.size,
                  height: d.size,
                  borderRadius: d.size / 2,
                },
              ]}
            />
          ))}

          <Text style={styles.progress}>
            {stepIndex + 1} / {TOUR_STEPS.length}
          </Text>
          <Text style={styles.message}>{step.message}</Text>
          <View style={styles.actions}>
            <Pressable onPress={skip} hitSlop={10}>
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>
            <Pressable style={styles.nextButton} onPress={next} hitSlop={6}>
              <Text style={styles.nextText}>{isLast ? "Got it" : "Next"}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Above SettingsButton's zIndex: 10, which is itself above TabsHeader's
  // zIndex: 5 — this has to clear both.
  root: { zIndex: 20, elevation: 20 },
  backdrop: { backgroundColor: "rgba(10, 11, 16, 0.62)" },
  ring: {
    position: "absolute",
    borderWidth: 3,
    borderColor: PURPLE,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  bubbleWrap: {
    position: "absolute",
    left: 20,
    right: 20,
    alignItems: "center",
  },
  bubble: {
    maxWidth: BUBBLE_MAX_WIDTH,
    width: "100%",
    backgroundColor: PURPLE,
    borderRadius: 22,
    padding: 18,
    overflow: "visible",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 10,
  },
  // Same colour as the bubble fill — that's what sells them as part of its
  // outline rather than separate stickers.
  decor: {
    position: "absolute",
    backgroundColor: PURPLE,
  },
  progress: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.8,
    color: PURPLE_FG,
    opacity: 0.75,
    marginBottom: 4,
  },
  message: {
    fontFamily: fonts.bold,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.1,
    color: PURPLE_FG,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 16,
    marginTop: 14,
  },
  skipText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: PURPLE_FG,
    opacity: 0.75,
  },
  nextButton: {
    backgroundColor: PURPLE_FG,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  nextText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: PURPLE,
  },
});
