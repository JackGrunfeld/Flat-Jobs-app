import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MainTabNavigator from "./MainTabNavigator";
import SettingsScreen from "../screens/SettingsScreen";

// Settings used to be a 5th bottom tab; it's now reached via a small gear
// button in the corner of each tab screen (see components/SettingsButton),
// pushed on top of the tab bar rather than living inside it — freeing up
// the tab slot for Splitwise.
export type RootStackParamList = {
  Tabs: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={MainTabNavigator} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ animation: "slide_from_right" }} />
    </Stack.Navigator>
  );
}
