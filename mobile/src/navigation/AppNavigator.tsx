import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MainTabNavigator from "./MainTabNavigator";
import SettingsScreen from "../screens/SettingsScreen";
import { AddActionProvider } from "./AddActionContext";

// Settings used to be a 5th bottom tab; it's now reached via a small gear
// button in the corner of each tab screen (see components/SettingsButton),
// pushed on top of the tab bar rather than living inside it — freeing up
// the tab slot for Bills.
export type RootStackParamList = {
  Tabs: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    // Wraps the stack rather than the tab navigator so the registry outlives
    // any push onto Settings and back.
    <AddActionProvider>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs" component={MainTabNavigator} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ animation: "slide_from_right" }} />
      </Stack.Navigator>
    </AddActionProvider>
  );
}
