import React, { useEffect, useMemo, useRef } from "react";
import { Easing, StyleSheet, View, useWindowDimensions } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { BottomTabNavigationOptions } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import HomeScreen from "../screens/HomeScreen";
import HouseScreen from "../screens/HouseScreen";
import ShoppingScreen from "../screens/ShoppingScreen";
import BillsScreen from "../screens/BillsScreen";
import SwipeableTabScreen from "./SwipeableTabScreen";
import FlatTabBar from "./FlatTabBar";
import TabsHeader from "../components/TabsHeader";
import TourOverlay from "./TourOverlay";
import { useTour } from "./TourContext";
import { useAuth } from "../context/AuthContext";
import { hasSeenTour } from "../storage/onboardingTour";
import type { RootStackParamList } from "./AppNavigator";

// How long after landing on the tab flow the walkthrough waits before
// kicking off — long enough for the tab bar/settings avatar to have
// measured themselves and for the first paint to settle, so the tour's
// first ring doesn't pop in ahead of the screen it's pointing at.
const TOUR_START_DELAY_MS = 700;

export type MainTabParamList = {
  Home: undefined;
  House: undefined;
  Shopping: undefined;
  Bills: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainTabNavigator() {
  // Read live rather than off Dimensions at module scope, so the slide still
  // covers the screen after a rotation or a split-screen resize.
  const { width } = useWindowDimensions();
  const { currentUser } = useAuth();
  const { start, setRootNavigator } = useTour();
  const triedTour = useRef(false);
  // This component *is* the "Tabs" screen, so its own navigation prop is the
  // root stack's — that's the one the tour needs to push onto "Settings" for
  // its Home Hub steps. FlatTabBar hands over the tab-level navigator
  // separately, for switching tabs.
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  useEffect(() => {
    setRootNavigator(rootNavigation);
    return () => setRootNavigator(null);
  }, [rootNavigation, setRootNavigator]);

  // Kicks the walkthrough off the first time a brand-new account lands here
  // — once profile setup and flat setup are both behind it. Guarded by a
  // ref rather than just the AsyncStorage check so it can't re-fire from a
  // re-render while the check is still in flight.
  useEffect(() => {
    if (triedTour.current || !currentUser) return;
    triedTour.current = true;
    let cancelled = false;
    hasSeenTour(currentUser.id).then((seen) => {
      if (!seen && !cancelled) setTimeout(start, TOUR_START_DELAY_MS);
    });
    return () => {
      cancelled = true;
    };
  }, [currentUser, start]);

  const screenOptions = useMemo<BottomTabNavigationOptions>(
    () => ({
      headerShown: false,
      tabBarShowLabel: false,
      // Mounted upfront rather than on first visit: the pages are meant to be
      // there already and slide into view, and a tab that mounts as it enters
      // spends the first frames of its own arrival blank. Data still loads on
      // focus, so this costs render time, not requests.
      lazy: false,
      // The tabs are pages side by side, and changing tab slides the strip
      // along — the one you're leaving goes a full screen-width out as the one
      // you're arriving at comes in from the opposite edge, the way a phone's
      // home screen moves. `progress` is -1 for a screen sitting left of the
      // active tab, 0 for the active one and +1 for one to its right, so a
      // width-for-width mapping is the whole animation. Both screens stay
      // rendered for the duration, so they travel together as one strip
      // instead of one appearing once the other has gone.
      //
      // Deliberately not one of the named animations: `shift` nudges a screen
      // 50pt and cross-fades it, which reads as a dissolve rather than as the
      // page having moved somewhere.
      sceneStyleInterpolator: ({ current }) => ({
        sceneStyle: {
          transform: [
            {
              translateX: current.progress.interpolate({
                inputRange: [-1, 0, 1],
                outputRange: [-width, 0, width],
              }),
            },
          ],
        },
      }),
      // Eases out rather than springing: a page that's been flicked should
      // carry its momentum and settle, not overshoot and come back.
      transitionSpec: {
        animation: "timing",
        config: { duration: 260, easing: Easing.out(Easing.cubic) },
      },
    }),
    [width],
  );

  return (
    // TabsHeader lives outside the navigator's own tree entirely — screens
    // are what the sceneStyleInterpolator's translateX slides, and anything
    // rendered *inside* one (as every screen's own copy of this used to be)
    // slides right along with it. A sibling here, exactly like FlatTabBar at
    // the bottom, never moves: the tabs swipe underneath it instead.
    <View style={styles.root}>
      <TabsHeader />
      <Tab.Navigator
        // The bar itself is ours — a pill with a raised centre "+" whose action
        // depends on the focused tab. See FlatTabBar.
        tabBar={(props) => <FlatTabBar {...props} />}
        // Every tab screen is wrapped so a horizontal drag walks to the
        // neighbouring tab; the bar's buttons still work exactly as before.
        screenLayout={({ navigation, route, children }) => (
          <SwipeableTabScreen navigation={navigation} route={route}>
            {children}
          </SwipeableTabScreen>
        )}
        screenOptions={screenOptions}
      >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? "home" : "home-outline"} size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="House"
          component={HouseScreen}
          options={{
            tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="broom" size={size} color={color} />,
          }}
        />
        <Tab.Screen
          name="Shopping"
          component={ShoppingScreen}
          options={{
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? "cart" : "cart-outline"} size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Bills"
          component={BillsScreen}
          options={{
            tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="currency-usd" size={size} color={color} />,
          }}
        />
      </Tab.Navigator>
      {/* Last in the tree so it paints over both TabsHeader and the tab bar
          — everything the walkthrough can point at. */}
      <TourOverlay />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
