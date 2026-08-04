import React from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";

export const FAB_SIZE = 64;

type Props = {
  bottom: number;
  translateY: Animated.AnimatedInterpolation<number>;
  onPress: () => void;
};

// Big orange square "+" button, pinned above the tab bar. Its vertical
// position is driven entirely by the caller's `translateY` — the button
// itself just renders, the show/hide-on-scroll logic lives in ShoppingScreen.
export default function AddItemFab({ bottom, translateY, onPress }: Props) {
  const { colors } = useTheme();

  return (
    <View style={[styles.wrap, { bottom }]} pointerEvents="box-none">
      <Animated.View style={{ transform: [{ translateY }] }}>
        <Pressable style={[styles.button, { backgroundColor: colors.accent }]} onPress={onPress} hitSlop={8}>
          <Ionicons name="add" size={32} color={colors.accentText} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 10 },
  button: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
});
