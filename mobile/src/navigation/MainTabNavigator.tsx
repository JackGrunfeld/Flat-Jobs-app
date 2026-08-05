import React from "react";
import { StyleSheet } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import HomeScreen from "../screens/HomeScreen";
import HouseScreen from "../screens/HouseScreen";
import ShoppingScreen from "../screens/ShoppingScreen";
import SplitwiseScreen from "../screens/SplitwiseScreen";
import SwipeableTabScreen from "./SwipeableTabScreen";
import { useTheme } from "../context/ThemeContext";
import { withAlpha } from "../theme/colors";

export type MainTabParamList = {
  Home: undefined;
  House: undefined;
  Shopping: undefined;
  Splitwise: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

// Matches the icon-only bar's default content height — padding above and
// below is built symmetrically around this so the icons sit centred rather
// than crowded toward one edge.
const BAR_CONTENT_HEIGHT = 40;
const BAR_PADDING = 14;

export default function MainTabNavigator() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      // Every tab screen is wrapped so a horizontal drag walks to the
      // neighbouring tab; the bar's buttons still work exactly as before.
      screenLayout={({ navigation, route, children }) => (
        <SwipeableTabScreen navigation={navigation} route={route}>
          {children}
        </SwipeableTabScreen>
      )}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        // Slides the outgoing/incoming screen in the direction of travel, so a
        // swipe (and a tap) reads as movement between tabs rather than a cut.
        animation: "shift",
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: "transparent",
          borderTopWidth: 0,
          height: BAR_CONTENT_HEIGHT + BAR_PADDING * 2 + insets.bottom,
          paddingTop: BAR_PADDING,
          paddingBottom: BAR_PADDING + insets.bottom,
        },
        // Renders behind the icons only — the gradient fades from a
        // translucent version of the background colour at the top edge to
        // fully solid by the bottom, so the icons themselves stay untouched.
        tabBarBackground: () => (
          <LinearGradient
            colors={[withAlpha(colors.bg, 0.4), colors.bg]}
            locations={[0, 0.7]}
            style={StyleSheet.absoluteFill}
          />
        ),
      }}
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
