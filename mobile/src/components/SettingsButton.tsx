import React from "react";
import { Animated, Pressable, StyleSheet, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import { useNavigation, type CompositeNavigationProp } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import type { MainTabParamList } from "../navigation/MainTabNavigator";
import type { RootStackParamList } from "../navigation/AppNavigator";

// Settings lives one level up, in the root stack that wraps the tab
// navigator — CompositeNavigationProp is what lets a screen inside a tab
// call .navigate("Settings") with that route type-checked, even though the
// nearest navigator (the tabs) doesn't own that route itself.
type Nav = CompositeNavigationProp<BottomTabNavigationProp<MainTabParamList>, NativeStackNavigationProp<RootStackParamList>>;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  // Lets a screen animate the button in and out — HomeScreen keeps it out of
  // sight until the page has been scrolled. Where the button sits stays this
  // component's business; a caller only layers opacity/transform on top, and
  // takes `pointerEvents` off with it so an invisible button isn't still a
  // live tap target in the corner.
  style?: Animated.WithAnimatedValue<StyleProp<ViewStyle>>;
  pointerEvents?: ViewProps["pointerEvents"];
};

// Small gear button pinned to the top-right corner of every tab screen —
// replaces the old Settings tab, which now frees that slot for Bills.
export default function SettingsButton({ style, pointerEvents }: Props) {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <AnimatedPressable
      style={[
        styles.button,
        { top: insets.top + 12, backgroundColor: colors.surfaceAlt, borderColor: colors.border },
        style,
      ]}
      pointerEvents={pointerEvents}
      onPress={() => navigation.navigate("Settings")}
      hitSlop={10}
    >
      <Ionicons name="settings-outline" size={16} color={colors.textMuted} />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
});
