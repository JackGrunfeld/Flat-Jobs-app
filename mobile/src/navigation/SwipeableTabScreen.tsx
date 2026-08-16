import React, { useRef } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { RouteProp } from "@react-navigation/native";
import type { MainTabParamList } from "./MainTabNavigator";
import { isTabSwipeLocked } from "./tabSwipeLock";

// How far a drag has to travel, and how much more horizontal than vertical it
// has to be, before we take the gesture away from the screen's own children.
const CLAIM_DISTANCE = 24;
const HORIZONTAL_RATIO = 2;

// Once claimed, either a long enough drag or a quick flick commits the change.
const COMMIT_DISTANCE = 70;
const COMMIT_VELOCITY = 0.3;

type Props = {
  navigation: BottomTabNavigationProp<MainTabParamList>;
  route: RouteProp<MainTabParamList, keyof MainTabParamList>;
  children: React.ReactNode;
};

// Wraps every tab screen so a horizontal drag moves to the neighbouring tab,
// as an alternative to tapping the bar. Deliberately *non*-capturing: the
// responder system hands capture-phase handlers to children first, so
// ShoppingItemCard's swipe-to-delete still wins on a card, and vertical list
// scrolling never satisfies the ratio test — both keep working untouched.
export default function SwipeableTabScreen({ navigation, route, children }: Props) {
  // The pan responder is built once, so read navigation/route through a ref
  // rather than closing over the values from first render.
  const latest = useRef({ navigation, route });
  latest.current = { navigation, route };

  // Swiping left reveals the tab to the right, hence the inverted sign.
  const neighbour = (dx: number) => {
    const { navigation: nav, route: current } = latest.current;
    const state = nav.getState();
    const index = state.routes.findIndex((r) => r.key === current.key);
    if (index === -1) return undefined;
    return state.routes[index + (dx < 0 ? 1 : -1)]?.name;
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) => {
        // The finger is on something that scrolls sideways in its own right —
        // a day strip, a carousel. That drag belongs to it, not to us.
        if (isTabSwipeLocked()) return false;
        if (Math.abs(gesture.dx) < CLAIM_DISTANCE) return false;
        if (Math.abs(gesture.dx) < Math.abs(gesture.dy) * HORIZONTAL_RATIO) return false;
        // Nothing either side of the first/last tab — leave the gesture alone.
        return neighbour(gesture.dx) !== undefined;
      },
      // Having claimed a swipe, see it through rather than handing it back.
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_evt, gesture) => {
        const far = Math.abs(gesture.dx) > COMMIT_DISTANCE;
        const fast = Math.abs(gesture.vx) > COMMIT_VELOCITY;
        if (!far && !fast) return;
        const target = neighbour(gesture.dx);
        if (target) latest.current.navigation.navigate(target);
      },
    }),
  ).current;

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
