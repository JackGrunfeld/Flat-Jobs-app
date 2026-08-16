import React, { useMemo } from "react";
import { Easing, useWindowDimensions } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { BottomTabNavigationOptions } from "@react-navigation/bottom-tabs";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import HomeScreen from "../screens/HomeScreen";
import HouseScreen from "../screens/HouseScreen";
import ShoppingScreen from "../screens/ShoppingScreen";
import SplitwiseScreen from "../screens/SplitwiseScreen";
import SwipeableTabScreen from "./SwipeableTabScreen";
import FlatTabBar from "./FlatTabBar";

export type MainTabParamList = {
  Home: undefined;
  House: undefined;
  Shopping: undefined;
  Splitwise: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainTabNavigator() {
  // Read live rather than off Dimensions at module scope, so the slide still
  // covers the screen after a rotation or a split-screen resize.
  const { width } = useWindowDimensions();

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
        name="Splitwise"
        component={SplitwiseScreen}
        options={{
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="currency-usd" size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}
