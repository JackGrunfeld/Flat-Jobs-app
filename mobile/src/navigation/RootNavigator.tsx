import React from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import AuthScreen from "../screens/AuthScreen";
import FlatSetupScreen from "../screens/FlatSetupScreen";
import MainTabNavigator from "./MainTabNavigator";

// Replaces app.js's AppShell conditional rendering. Same four states as the
// web version, same shape (component swap, not a stack push) — a user who's
// authenticated but flat-less never sees a "back" affordance into a route
// that assumes they have a flat, because that route simply isn't mounted.
export default function RootNavigator() {
  const { authLoading, currentUser, userFlat } = useAuth();

  if (authLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {!currentUser ? <AuthScreen /> : !userFlat ? <FlatSetupScreen /> : <MainTabNavigator />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
});
