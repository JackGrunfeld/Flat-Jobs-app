import React from "react";
import { View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { useFonts } from "expo-font";
import { SpaceMono_400Regular, SpaceMono_700Bold } from "@expo-google-fonts/space-mono";
import { RussoOne_400Regular } from "@expo-google-fonts/russo-one";
import { NotoSansKR_400Regular, NotoSansKR_700Bold } from "@expo-google-fonts/noto-sans-kr";
import { AuthProvider } from "./src/context/AuthContext";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import RootNavigator from "./src/navigation/RootNavigator";
import { GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from "./src/config/env";

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

GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, iosClientId: GOOGLE_IOS_CLIENT_ID });

// Everything below the provider, so the font-loading placeholder and the
// status bar can both read the active theme. Status bar glyphs have to track
// our own toggle rather than the OS's — "auto" reads the system setting and
// would invert the wrong way whenever the two disagree.
function ThemedApp() {
  const { colors, scheme } = useTheme();

  // Loaded once here (not in AuthScreen) so the app's typography is
  // available everywhere, including for users who skip sign-in entirely
  // via a persisted session.
  const [fontsLoaded] = useFonts({
    SpaceMono_400Regular,
    SpaceMono_700Bold,
    RussoOne_400Regular,
    NotoSansKR_400Regular,
    NotoSansKR_700Bold,
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedApp />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
