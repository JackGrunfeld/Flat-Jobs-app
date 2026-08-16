import React, { useMemo, useState } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import RadialAddMenu from "../components/RadialAddMenu";
import { useAddAction, type AddActionRoute } from "./AddActionContext";

const BAR_HEIGHT = 58;
const PLUS_SIZE = 62;
// How much of the "+" rises above the bar's top edge — kept low so the button
// sits down in the bar rather than perching on it.
const PLUS_OVERLAP = 14;
// The collar is a disc of the bar's own colour sitting behind the "+" and
// overlapping the bar's top edge, so the two read as one shape rather than a
// button floating over a pill.
const COLLAR_PAD = 7;
const COLLAR_SIZE = PLUS_SIZE + COLLAR_PAD * 2;
// Headroom the container reserves so neither the raised "+" nor its collar is
// clipped. The bar still takes part in layout, so screens lay out above it.
const HEADROOM = PLUS_OVERLAP + COLLAR_PAD + 4;
const SIDE_PADDING = 16;
// The bar is near-black with a blue cast in both schemes rather than taking
// the theme's surface — so it stays a dark cradle for the pastel "+" whichever
// way the appearance toggle is set. Everything drawn on it therefore needs its
// own on-dark values below rather than the theme's scheme-dependent ones.
const NAV_DARK = "#1b1f2a";
const NAV_ICON_MUTED = "rgba(255, 255, 255, 0.55)";
const OUTLINE_WIDTH = 2;

// The bar floats over the screens so the page shows through beside and behind
// the pill, which means it no longer reserves space in the layout. Screens add
// this much bottom padding themselves so their last row can still be scrolled
// clear of it.
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return HEADROOM + BAR_HEIGHT + insets.bottom;
}
export default function FlatTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { runAddAction } = useAddAction();

  const [menuOpen, setMenuOpen] = useState(false);
  const spin = React.useRef(new Animated.Value(0)).current;

  const focusedRoute = state.routes[state.index].name as AddActionRoute;

  const setMenu = (open: boolean) => {
    setMenuOpen(open);
    Animated.timing(spin, { toValue: open ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  };

  const onPlusPress = () => {
    // Home has nothing of its own to add, so it offers the other three
    // instead; every other tab goes straight to its own form.
    if (focusedRoute === "Home") setMenu(!menuOpen);
    else runAddAction(focusedRoute);
  };

  const onRadialSelect = (route: AddActionRoute) => {
    setMenu(false);
    navigation.navigate(route);
    // The target tab may not have mounted yet — AddActionContext holds the
    // request until that screen registers its handler.
    runAddAction(route);
  };

  const renderTab = (routeIndex: number) => {
    const route = state.routes[routeIndex];
    const { options } = descriptors[route.key];
    const focused = state.index === routeIndex;
    // The pastel itself, not `accentInk` — the ink is deepened for light
    // backgrounds and would disappear into this bar.
    const color = focused ? colors.accent : NAV_ICON_MUTED;

    const onPress = () => {
      const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
    };

    return (
      <Pressable
        key={route.key}
        style={styles.tab}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={focused ? { selected: true } : {}}
        accessibilityLabel={options.tabBarAccessibilityLabel ?? route.name}
      >
        {options.tabBarIcon?.({ focused, color, size: 24 })}
      </Pressable>
    );
  };

  // Two tabs either side of the "+". Splitting the array rather than hard-
  // coding names keeps this working if a tab is added or reordered.
  const half = Math.ceil(state.routes.length / 2);

  // Measured from the container's bottom edge: raises the button so
  // PLUS_OVERLAP of it clears the bar's top edge.
  const plusBottom = insets.bottom + BAR_HEIGHT - PLUS_SIZE + PLUS_OVERLAP;

  return (
    <>
      <RadialAddMenu
        visible={menuOpen}
        // The raised "+" sits above the bar's midline, so the arc and its
        // shading pivot on the button's real centre rather than the bar's.
        originBottom={plusBottom + PLUS_SIZE / 2}
        onDismiss={() => setMenu(false)}
        onSelect={onRadialSelect}
      />

      <View style={[styles.container, { paddingBottom: insets.bottom }]} pointerEvents="box-none">
        <View style={styles.bar}>
          <View style={styles.side}>{state.routes.slice(0, half).map((_, i) => renderTab(i))}</View>
          <View style={styles.plusGap} />
          <View style={styles.side}>{state.routes.slice(half).map((_, i) => renderTab(half + i))}</View>
        </View>

        {/* Drawn after the bar and in the same colour, so it merges into the
            pill as a bulge around the "+" instead of reading as a separate disc. */}
        <View style={[styles.collar, { bottom: plusBottom - COLLAR_PAD }]} pointerEvents="none" />

        <Pressable
          style={[styles.plus, { bottom: plusBottom }]}
          onPress={onPlusPress}
          accessibilityLabel={menuOpen ? "Close add menu" : "Add"}
        >
          <Animated.View
            style={{
              transform: [
                { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "45deg"] }) },
              ],
            }}
          >
            <Ionicons name="add" size={34} color={colors.accentText} />
          </Animated.View>
        </Pressable>
      </View>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      // Floats over the screens rather than sitting in the layout flow, so the
      // page keeps running underneath and shows through beside and behind the
      // pill. Screens make up the lost space with useTabBarSpace().
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      // No fill of its own — only the pill and its collar are painted.
      backgroundColor: "transparent",
      // Headroom so the raised "+" and its collar aren't clipped.
      paddingTop: HEADROOM,
      paddingHorizontal: SIDE_PADDING,
    },
    bar: {
      height: BAR_HEIGHT,
      flexDirection: "row",
      // Stretch, not center: the rows either side have to fill the bar's
      // height for their own centring to have anything to centre against.
      alignItems: "stretch",
      backgroundColor: NAV_DARK,
      borderRadius: BAR_HEIGHT / 2,
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 },
      elevation: 10,
    },
    side: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-evenly" },
    // Reserves the middle of the bar so the tabs never sit under the "+".
    plusGap: { width: PLUS_SIZE + 16 },
    tab: { flex: 1, alignItems: "center", justifyContent: "center" },
    collar: {
      position: "absolute",
      alignSelf: "center",
      width: COLLAR_SIZE,
      height: COLLAR_SIZE,
      borderRadius: COLLAR_SIZE / 2,
      backgroundColor: NAV_DARK,
      // Explicit ordering rather than relying on paint order — the bar's
      // elevation would otherwise put it above the collar on Android.
      zIndex: 1,
    },
    plus: {
      position: "absolute",
      alignSelf: "center",
      width: PLUS_SIZE,
      height: PLUS_SIZE,
      borderRadius: PLUS_SIZE / 2,
      backgroundColor: colors.accent,
      // Rings the pastel disc where it rises clear of the bar, so it reads as
      // one piece with the bar rather than a sticker on top of it.
      borderWidth: OUTLINE_WIDTH,
      borderColor: NAV_DARK,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 2,
      shadowColor: "#000",
      shadowOpacity: 0.3,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
      elevation: 12,
    },
  });
}
