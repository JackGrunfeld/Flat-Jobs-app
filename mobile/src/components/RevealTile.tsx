import React, { useCallback, useRef } from "react";
import { Animated, type StyleProp, type ViewStyle } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

// Staggered fade-up on mount/focus — each tile waits `delay` ms before
// tweening in, so a page reveals itself block-by-block instead of popping in
// flat. Shared by the dashboard's mosaic and the bills tab, so both tabs
// arrive with the same motion.
//
// `style` is what lets a tile also be a column of a flex row — without it the
// wrapper sizes to its content and collapses the row it sits in.
export default function RevealTile({
  delay,
  style,
  children,
}: {
  delay: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: 420, delay, useNativeDriver: true }).start();
    }, [anim, delay]),
  );

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
