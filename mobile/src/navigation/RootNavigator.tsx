import React from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { DarkTheme, DefaultTheme, NavigationContainer, Theme } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import AuthScreen from "../screens/AuthScreen";
import ProfileSetupScreen from "../screens/ProfileSetupScreen";
import FlatSetupScreen from "../screens/FlatSetupScreen";
import AppNavigator from "./AppNavigator";
import type { User, Flat } from "../types";

// Set to true to skip login during UI development. Never commit as true.
const DEV_BYPASS_AUTH = __DEV__ && false;

const DEV_USER: User = {
  id: "dev-user",
  email: "dev@flatjobs.app",
  displayName: "Dev User",
  birthday: null,
  country: null,
  termsAcceptedAt: null,
  profileComplete: true,
};
const DEV_FLAT: Flat = {
  id: "dev-flat",
  name: "Dev Flat",
  code: "DEV000",
  ownerId: "dev-user",
  members: [{ userId: "dev-user", displayName: "Dev User", color: "#4A90E2", birthday: null }],
  invitedEmails: [],
};

export default function RootNavigator() {
  const { authLoading, currentUser, userFlat } = useAuth();
  const { colors, scheme } = useTheme();

  // Base off React Navigation's own light/dark theme so the bits we don't
  // override (card shadows, the push/pop transition backdrop) match too.
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const navigationTheme: Theme = {
    ...base,
    colors: {
      ...base.colors,
      background: colors.bg,
      card: colors.bg,
      border: colors.border,
      primary: colors.accentInk,
      text: colors.text,
    },
  };

  if (DEV_BYPASS_AUTH) {
    return (
      <NavigationContainer theme={navigationTheme}>
        <AppNavigator />
      </NavigationContainer>
    );
  }

  if (authLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accentInk} />
      </View>
    );
  }

  const user = currentUser ?? (DEV_BYPASS_AUTH ? DEV_USER : null);
  const flat = userFlat ?? (DEV_BYPASS_AUTH ? DEV_FLAT : null);

  // Onboarding order: sign in, then fill in the profile (name/birthday/country),
  // then create or join a flat. The profile gate is driven by the server's
  // `profileComplete`, so OAuth signups — which arrive with a provider name but
  // no birthday or country — land on it too, as do accounts created before the
  // step existed.
  return (
    <NavigationContainer theme={navigationTheme}>
      {!user ? (
        <AuthScreen />
      ) : !user.profileComplete ? (
        <ProfileSetupScreen />
      ) : !flat ? (
        <FlatSetupScreen />
      ) : (
        <AppNavigator />
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
});
