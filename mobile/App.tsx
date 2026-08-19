import React from "react";
import { View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { useFonts } from "expo-font";
import { DMSans_400Regular, DMSans_700Bold, DMSans_900Black } from "@expo-google-fonts/dm-sans";
import { AuthProvider } from "./src/context/AuthContext";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import RootNavigator from "./src/navigation/RootNavigator";
import { GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID, GOOGLE_SIGNIN_CONFIGURED } from "./src/config/env";

// Foreground display config. Expo suppresses notifications that arrive while
// the app is open unless this is set — which is most of what the app sends
// now: a flatmate ticking a chore off lands while everyone else is likely to
// be looking at the roster.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Skipped entirely when unconfigured — calling configure() with an empty
// webClientId leaves the native module in a state that throws only later, at
// the point of sign-in, with an error that doesn't name the real cause.
if (GOOGLE_SIGNIN_CONFIGURED) {
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, iosClientId: GOOGLE_IOS_CLIENT_ID });
}

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
    DMSans_400Regular,
    DMSans_700Bold,
    DMSans_900Black,
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <>
      <RootNavigator />
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
    </>
  );
}

// Auth wraps the theme, not the other way round: the accent is the signed-in
// member's own colour, so the theme has to be able to read the session.
export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ThemeProvider>
          <ThemedApp />
        </ThemeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
