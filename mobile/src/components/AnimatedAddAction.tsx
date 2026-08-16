import React, { useMemo, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import type { CalendarEvent } from "../types";

type Props = {
  banner: CalendarEvent | null;
  onAdd: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onView: () => void;
  onOpenChange?: (open: boolean) => void;
};

export default function AnimatedAddAction({ banner, onAdd, onEdit, onDelete, onView, onOpenChange }: Props) {
  const { colors } = useTheme();
  const progress = useRef(new Animated.Value(0)).current;
  const [open, setOpen] = useState(false);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const valueRef = useRef(0);
  progress.addListener(({ value }) => (valueRef.current = value));
  const toggle = (to?: boolean) => {
    const target = typeof to === "boolean" ? (to ? 1 : 0) : valueRef.current ? 0 : 1;
    Animated.timing(progress, { toValue: target, duration: 240, useNativeDriver: true }).start(() => {
      const isOpen = Boolean(target);
      setOpen(isOpen);
      onOpenChange?.(isOpen);
    });
  };

  const R = 64;
  const actions = [
    { key: "view", icon: "eye", handler: onView, label: "View" },
    { key: "edit", icon: "pencil", handler: onEdit, label: "Edit" },
    { key: "delete", icon: "trash", handler: onDelete, label: "Delete" },
  ];
  // Desired layout: left (180°), up-left (135°), and straight up (90°)
  const angles = [180, 135, 90];

  const infoIcon = (
    <View style={[styles.bubble, { backgroundColor: colors.accent }]}>
      <Ionicons name="information-circle-outline" size={18} color={colors.accentText} />
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Full-screen overlay to catch outside taps and close the radial when open */}
      {open && (
        <Pressable onPress={() => toggle(false)} style={StyleSheet.absoluteFill} />
      )}
      {/* Radial action buttons that pop out from the info button when banner exists */}
      {banner &&
        actions.map((a, i) => {
          const angleRad = (angles[i] * Math.PI) / 180;
          const dx = Math.round(Math.cos(angleRad) * R);
          // Positive sin moves down; negate so positive radial angle lifts up.
          const dy = -Math.round(Math.sin(angleRad) * R);

          const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, dx] });
          const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [0, dy] });
          // Keep collapsed buttons visible: start at 0.75 scale and slightly opaque.
          const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] });
          const opacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });

          return (
            <Animated.View
              key={a.key}
              style={[
                styles.radialButton,
                { transform: [{ translateX }, { translateY }, { scale }], zIndex: 999, elevation: 20, opacity },
              ]}
            >
              <Pressable
                onPress={() => {
                  // close first so the UI responds immediately
                  toggle(false);
                  a.handler();
                }}
                style={[styles.smallButton, { backgroundColor: colors.accent }]}
              >
                <Ionicons name={a.icon as any} size={16} color={colors.accentText} />
              </Pressable>
            </Animated.View>
          );
        })}

      <Pressable
        onPress={() => (banner ? toggle() : onAdd())}
        style={[styles.mainButton, { zIndex: 1000, elevation: 30 }]}
        hitSlop={8}
        accessibilityLabel="Details"
      >
        {infoIcon}
      </Pressable>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flexDirection: "row", alignItems: "center" },
    radialButton: { position: "absolute", left: 0, bottom: 0 },
    // High layer so the buttons appear above page content
    smallButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
      marginHorizontal: 4,
    },
    mainButton: {},
    bubble: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
  });
}
