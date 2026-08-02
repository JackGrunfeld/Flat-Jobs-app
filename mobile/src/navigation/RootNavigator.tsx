import React from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import AuthScreen from "../screens/AuthScreen";
import FlatSetupScreen from "../screens/FlatSetupScreen";
import MainTabNavigator from "./MainTabNavigator";
import type { User, Flat } from "../types";

// Set to true to skip login during UI development. Never commit as true.
const DEV_BYPASS_AUTH = __DEV__ && false;

const DEV_USER: User = { id: "dev-user", email: "dev@flatjobs.app", displayName: "Dev User" };
const DEV_FLAT: Flat = {
  id: "dev-flat",
  name: "Dev Flat",
  code: "DEV000",
  ownerId: "dev-user",
  members: [{ userId: "dev-user", displayName: "Dev User", color: "#4A90E2" }],
  invitedEmails: [],
};

export default function RootNavigator() {
  const { authLoading, currentUser, userFlat } = useAuth();

  if (DEV_BYPASS_AUTH) {
    return (
      <NavigationContainer>
        <MainTabNavigator />
      </NavigationContainer>
    );
  }

  if (authLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const user = currentUser ?? (DEV_BYPASS_AUTH ? DEV_USER : null);
  const flat = userFlat ?? (DEV_BYPASS_AUTH ? DEV_FLAT : null);

  return (
    <NavigationContainer>
      {!user ? <AuthScreen /> : !flat ? <FlatSetupScreen /> : <MainTabNavigator />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
});
