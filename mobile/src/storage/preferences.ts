import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ColorScheme } from "../theme/colors";

// Non-sensitive settings only — deliberately not SecureStore, since these are
// preferences rather than credentials.
const THEME_SCHEME_KEY = "flatjobs.themeScheme";

export async function getThemeScheme(): Promise<ColorScheme> {
  const value = await AsyncStorage.getItem(THEME_SCHEME_KEY);
  return value === "dark" ? "dark" : "light"; // default light; an explicit choice still wins
}

export async function setThemeScheme(scheme: ColorScheme): Promise<void> {
  await AsyncStorage.setItem(THEME_SCHEME_KEY, scheme);
}
