import React from "react";
import { Pressable, StyleSheet } from "react-native";
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

// Small gear button pinned to the top-right corner of every tab screen —
// replaces the old Settings tab, which now frees that slot for Splitwise.
export default function SettingsButton() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <Pressable
      style={[styles.button, { top: insets.top + 12, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
      onPress={() => navigation.navigate("Settings")}
      hitSlop={10}
    >
      <Ionicons name="settings-outline" size={16} color={colors.textMuted} />
    </Pressable>
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
