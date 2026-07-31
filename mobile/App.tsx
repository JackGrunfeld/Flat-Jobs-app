import React from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { AuthProvider } from "./src/context/AuthContext";
import RootNavigator from "./src/navigation/RootNavigator";
import { GOOGLE_WEB_CLIENT_ID } from "./src/config/env";

// Foreground display config for local completion alerts (and any settlement
// push that arrives while the app is open) — Expo suppresses foreground
// notifications unless this is set, unlike the web Notification API.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
