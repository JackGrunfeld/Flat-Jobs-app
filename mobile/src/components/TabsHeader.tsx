import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import SettingsButton, { HEADER_TITLE_TOP } from "./SettingsButton";

// The wordmark's own line — the same rhythm SettingsButton centres its
// avatar on (see HEADER_TITLE_TOP).
const BRAND_LINE = 31;
// The header's own bottom padding, so its visible box doesn't end flush on
// the wordmark's descenders.
const HEADER_PADDING_BOTTOM = 6;

// How much space a screen needs to reserve at the top of its own content so
// nothing starts out hidden under this header — the top-of-screen
// counterpart to useTabBarSpace at the bottom. `gap` is the breathing room
// between the header's bottom edge and whatever a screen puts first (its own
// page title, typically) — 16 to match the rhythm every tab already used.
export function useTabsHeaderSpace(gap = 16) {
  const insets = useSafeAreaInsets();
  return insets.top + HEADER_TITLE_TOP + BRAND_LINE + HEADER_PADDING_BOTTOM + gap;
}

// The "HOMIES!" wordmark and the settings avatar, mounted once above the tab
// navigator rather than inside each screen — every screen used to carry its
// own copy, which meant both slid off with the rest of the screen during a
// tab swipe (the sceneStyleInterpolator's translateX applies to a screen's
// whole tree). Sitting outside that tree, this bar is pinned exactly the way
// FlatTabBar is pinned at the bottom: the tabs slide underneath it, it never
// moves. Each screen still owns its own page title as the first line of its
// own (scrolling) content — only the brand and the avatar are shared chrome.
export default function TabsHeader() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <>
      <View style={[styles.header, { paddingTop: insets.top + HEADER_TITLE_TOP }]} pointerEvents="box-none">
        <Text style={styles.brandTitle} numberOfLines={1}>
          HOMIES!
        </Text>
      </View>
      {/* Its own sibling, not a child of `header` — SettingsButton positions
          itself off the screen's insets directly, so nesting it inside a
          padded parent would double up that offset. */}
      <SettingsButton />
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    header: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 16,
      paddingBottom: 6,
      backgroundColor: colors.bg,
      // Above every screen's own content (which carries no zIndex of its
      // own) so nothing scrolls in front of it — but below SettingsButton's
      // own zIndex (10), so the avatar still paints on top of this box
      // rather than being covered by its solid background.
      zIndex: 5,
    },
    brandTitle: {
      fontFamily: fonts.display,
      color: colors.text,
      fontSize: 17,
      letterSpacing: 0.5,
      lineHeight: BRAND_LINE,
      paddingRight: 36,
    },
  });
}
