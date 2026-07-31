import AsyncStorage from "@react-native-async-storage/async-storage";

// Non-sensitive settings only. Ported from web's
// localStorage.getItem("completionAlerts") — deliberately not SecureStore,
// since this is a boolean preference, not a credential.
const COMPLETION_ALERTS_KEY = "flatjobs.completionAlerts";

export async function getCompletionAlertsEnabled(): Promise<boolean> {
  const value = await AsyncStorage.getItem(COMPLETION_ALERTS_KEY);
  return value !== "false"; // default on, matching the web version's default
}

export async function setCompletionAlertsEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(COMPLETION_ALERTS_KEY, enabled ? "true" : "false");
}
