import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ColorScheme } from "../theme/colors";

// Non-sensitive settings only. Ported from web's
// localStorage.getItem("completionAlerts") — deliberately not SecureStore,
// since this is a boolean preference, not a credential.
const COMPLETION_ALERTS_KEY = "flatjobs.completionAlerts";
const THEME_SCHEME_KEY = "flatjobs.themeScheme";

export async function getCompletionAlertsEnabled(): Promise<boolean> {
  const value = await AsyncStorage.getItem(COMPLETION_ALERTS_KEY);
  return value !== "false"; // default on, matching the web version's default
}

export async function setCompletionAlertsEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(COMPLETION_ALERTS_KEY, enabled ? "true" : "false");
}

export async function getThemeScheme(): Promise<ColorScheme> {
  const value = await AsyncStorage.getItem(THEME_SCHEME_KEY);
  return value === "light" ? "light" : "dark"; // default dark — the app's original look
}

export async function setThemeScheme(scheme: ColorScheme): Promise<void> {
  await AsyncStorage.setItem(THEME_SCHEME_KEY, scheme);
}
