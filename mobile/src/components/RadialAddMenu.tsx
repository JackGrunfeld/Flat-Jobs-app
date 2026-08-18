import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import type { AddActionRoute } from "../navigation/AddActionContext";

// Each item is swung out on an arm pinned to the "+": the arm rotates to its
// angle while extending to its length, so the bubble travels a curved path
// rather than a straight line. Angles are clockwise from "straight left".
const ANGLES = [30, 70, 110, 150];
const RADIUS = 112;
const STAGGER_MS = 45;
const OPEN_MS = 260;
const CLOSE_MS = 180;

// The arm is exactly the bubble's box, centred on the "+", so rotation pivots
// on the bubble's own centre — no transform-origin needed.
const BUBBLE = 56;

export type RadialItem = {
  route: AddActionRoute;
  /** Not drawn — the bubbles are icon-only. Names the button to screen readers. */
  label: string;
  icon: (color: string, size: number) => React.ReactNode;
};

export const RADIAL_ITEMS: RadialItem[] = [
  {
    route: "Home",
    label: "Calendar",
    icon: (color, size) => <Ionicons name="calendar" size={size} color={color} />,
  },
  {
    route: "House",
    label: "Chore",
    icon: (color, size) => <MaterialCommunityIcons name="broom" size={size} color={color} />,
  },
  {
    route: "Shopping",
    label: "Shopping",
    icon: (color, size) => <Ionicons name="cart-outline" size={size} color={color} />,
  },
  {
    route: "Bills",
    label: "Expense",
    icon: (color, size) => <MaterialCommunityIcons name="currency-usd" size={size} color={color} />,
  },
];

const TOTAL_OPEN_MS = OPEN_MS + STAGGER_MS * RADIAL_ITEMS.length;

type Props = {
  visible: boolean;
  // Distance from the bottom of the screen to the centre of the "+", so the
  // arc is drawn around the real button rather than a guessed position.
  originBottom: number;
  onDismiss: () => void;
  onSelect: (route: AddActionRoute) => void;
};

// Radial popover built the way the CSS circle menus do it: an arm that
// rotates and extends at the same time, with the contents counter-rotated by
// the same angle so they arrive upright — which means each bubble visibly
// spins itself the right way up as it swings out.
export default function RadialAddMenu({ visible, originBottom, onDismiss, onSelect }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // One shared 0->1 driver; each item reads a delayed slice of it so a single
  // timing call produces the stagger.
  const progress = useRef(new Animated.Value(0)).current;
  // Held mounted through the closing tween so it plays out — the earlier
  // version unmounted on the spot and the fan simply vanished.
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) setMounted(true);

    const anim = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? TOTAL_OPEN_MS : CLOSE_MS,
      // Overshooting on the way out lets the arms swing past their angle and
      // settle back, which is what sells the rotation.
      easing: visible ? Easing.out(Easing.back(1.4)) : Easing.in(Easing.quad),
      useNativeDriver: true,
    });

    anim.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });

    return () => anim.stop();
  }, [visible, progress]);

  if (!mounted) return null;

  return (
    // Inert the moment a close starts, so the closing tween can't swallow a
    // tap or a tab swipe on its way out.
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? "box-none" : "none"}>
      {/* Invisible, but still screen-wide: nothing is shaded behind the fan,
          so this is the only thing making a tap beside it close the menu. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel="Close add menu" />

      {RADIAL_ITEMS.map((item, index) => {
        const angle = ANGLES[index];

        // Each item consumes its own window of the shared driver.
        const start = (index * STAGGER_MS) / TOTAL_OPEN_MS;
        const travel = progress.interpolate({
          inputRange: [start, 1],
          outputRange: [0, 1],
          extrapolate: "clamp" as const,
        });

        return (
          <Animated.View
            key={item.route}
            pointerEvents="box-none"
            style={[
              styles.arm,
              {
                bottom: originBottom - BUBBLE / 2,
                opacity: travel.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: "clamp" }),
                // Rotate then extend: composing them in this order sweeps the
                // bubble along the arc instead of shooting it out in a line.
                transform: [
                  { rotate: travel.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${angle}deg`] }) },
                  { translateX: travel.interpolate({ inputRange: [0, 1], outputRange: [0, -RADIUS] }) },
                  { scale: travel },
                ],
              },
            ]}
          >
            {/* Cancels the arm's angle so the icon finishes upright, and so
                spins it up to level over the flight. */}
            <View style={[styles.upright, { transform: [{ rotate: `${-angle}deg` }] }]} pointerEvents="box-none">
              <Pressable
                style={styles.bubble}
                onPress={() => onSelect(item.route)}
                accessibilityLabel={`Add ${item.label}`}
              >
                {item.icon(colors.accentText, 22)}
              </Pressable>
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    arm: {
      position: "absolute",
      // Centred on the "+" in both axes, so the box's own centre is the pivot.
      left: "50%",
      marginLeft: -BUBBLE / 2,
      width: BUBBLE,
      height: BUBBLE,
    },
    upright: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: "center",
      justifyContent: "center",
    },
    bubble: {
      width: BUBBLE,
      height: BUBBLE,
      borderRadius: BUBBLE / 2,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOpacity: 0.3,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
  });
}
