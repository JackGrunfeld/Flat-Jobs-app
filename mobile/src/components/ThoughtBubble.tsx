import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import { fonts } from "../theme/fonts";

// Shrinking dots leading from the bubble down to the "+" — the same
// scallop-trail language as the reference CSS bubble's cloud tail, just
// straightened into a vertical point (centred under the bubble, same as the
// button below it) rather than trailing off to one side the way the original
// CSS's freely-drifting cloud did.
const DOTS = [20, 14, 9, 5];

// The reference CSS's `:before`/`:after` scallop, fused to the bubble's own
// edges the same way — a bump on each shoulder plus a couple more working
// round the rest of the border, so the whole outline reads as one bubbly
// cloud rather than a plain rounded rect. The bottom-right cluster CSS trails
// off the corner with isn't ported here: that's the DOTS trail's job below,
// kept dead-centre so the whole bubble reads as growing straight up out of
// the "+" instead of leaning to one side.
// Exported so other speech-bubble-shaped callouts (see TourOverlay) can
// reuse the same cloud outline instead of inventing their own.
export type Decor = { top?: number; bottom?: number; left?: number; right?: number; size: number };
export const DECOR: Decor[] = [
  { top: -7, left: 15, size: 24 }, // main bump, top-left shoulder
  { top: 10, left: -12, size: 11 }, // shadow, left edge
  { top: -9, right: 18, size: 20 }, // mirrored bump, top-right shoulder
  { top: 6, right: -11, size: 9 }, // shadow, right edge
  { bottom: -8, left: 26, size: 12 }, // bump, bottom-left
  { top: -14, left: 46, size: 8 }, // small one riding the top edge
];

// How long the bubble sits up on its own before it gives up and dismisses
// itself.
const AUTO_DISMISS_MS = 4000;

type Props = {
  visible: boolean;
  message: string;
  // Distance from the tab bar's bottom edge to the centre of the "+" —
  // RadialAddMenu anchors its fan off the same measurement, so the trail's
  // tip always lands exactly on the button regardless of device/safe-area.
  originBottom: number;
  onPress: () => void;
  onDismiss: () => void;
};

// A little "thinking" callout that grows out of the tab bar's "+", nudging
// towards something the button could do right now (e.g. logging an expense
// for what was just ticked off the shopping list). Tapping it fires the
// action; tapping anywhere else dismisses it, and so does just leaving it —
// there's no dimming behind it, just an invisible full-screen catcher, so the
// rest of the page still reads as untouched.
export default function ThoughtBubble({ visible, message, originBottom, onPress, onDismiss }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Held mounted through the closing tween, same as RadialAddMenu, so the
  // exit actually plays instead of the bubble just vanishing.
  const [mounted, setMounted] = useState(visible);
  const enter = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) setMounted(true);
    const anim = Animated.timing(enter, {
      toValue: visible ? 1 : 0,
      duration: visible ? 380 : 160,
      easing: visible ? Easing.out(Easing.back(1.5)) : Easing.in(Easing.quad),
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => anim.stop();
  }, [visible, enter]);

  // A slow breathe while it's up — sells "thinking" rather than a static
  // tooltip. Stopped rather than left running once closing starts, so it
  // doesn't fight the exit tween's own scale.
  useEffect(() => {
    if (!visible) {
      breathe.stopAnimation();
      breathe.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, breathe]);

  // Gives up on its own after a few seconds rather than sitting there
  // forever waiting for a tap that may never come.
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [visible, onDismiss]);

  if (!mounted) return null;

  const bubbleScale = Animated.multiply(
    enter.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }),
    breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] }),
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? "box-none" : "none"}>
      {/* Invisible — nothing dims behind the bubble — but full-screen, so a
          tap anywhere outside it reads as "dismiss". */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel="Dismiss" />

      <View style={[styles.wrap, { bottom: originBottom }]} pointerEvents="box-none">
        <Animated.View style={{ opacity: enter, transform: [{ scale: bubbleScale }] }}>
          <Pressable style={styles.bubble} onPress={onPress} accessibilityRole="button" accessibilityLabel={message}>
            {/* Fused to the bubble's own edges rather than animated on their
                own — they're part of its shape, so they just ride along with
                the bubble's single fade/scale-in above. */}
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

            <Text style={styles.text}>{message}</Text>
            {/* The tappable cue, standing in for a "Click here" label — a
                little cursor badge on the text's own right side. */}
            <View style={styles.actionBadge}>
              <MaterialCommunityIcons name="cursor-default-click-outline" size={16} color={colors.accent} />
            </View>
          </Pressable>
        </Animated.View>

        <View style={styles.trail} pointerEvents="none">
          {DOTS.map((size, i) => (
            <Animated.View
              key={size}
              style={[
                styles.dot,
                {
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  opacity: enter,
                  transform: [
                    {
                      scale: enter.interpolate({
                        // Smallest (closest to the button) pops in first, the
                        // way a comic thought-trail builds from the thinker
                        // up to the bubble.
                        inputRange: [0, 0.25 + (DOTS.length - 1 - i) * 0.2, 1],
                        outputRange: [0, 0, 1],
                        extrapolate: "clamp",
                      }),
                    },
                  ],
                },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      position: "absolute",
      left: 0,
      right: 0,
      alignItems: "center",
    },
    bubble: {
      backgroundColor: colors.accent,
      flexDirection: "row",
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 22,
      minWidth: 44,
      maxWidth: 260,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    // Positioned per-instance from DECOR above; this just carries the bits
    // every one of them shares.
    decor: {
      position: "absolute",
      backgroundColor: colors.accent,
    },
    text: {
      fontFamily: fonts.bold,
      fontSize: 14,
      letterSpacing: -0.2,
      color: colors.accentText,
      textAlign: "left",
      flexShrink: 1,
    },
    // A round badge on the text's right side, inverted like the old pill
    // was, so the cursor icon still reads as the tappable part.
    actionBadge: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.accentText,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    trail: {
      alignItems: "center",
      gap: 6,
      marginTop: 6,
    },
    dot: {
      backgroundColor: colors.accent,
    },
  });
}
