import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { registerPushToken } from "../services/pushTokensService";

// Registers this device for cross-device push: settlements, a flatmate
// ticking a chore off, and the morning chore digests the Worker's cron sends
// (workers/src/lib/choreDigest.ts). Called on login and app foreground, since
// the underlying token can rotate.
export async function registerForPushNotificationsAsync(): Promise<void> {
  if (!Device.isDevice) return; // push tokens aren't available on simulators/emulators

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let status = existingStatus;
  if (status !== "granted") {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== "granted") return;

  // Written into app.json by `eas init`. A standalone build can't mint an Expo
  // push token without it, and `getExpoPushTokenAsync` throws rather than
  // returning empty — which, called from the login path, would take sign-in
  // down with it. Push is a feature; being able to log in is not, so a missing
  // or rejected project ID is warned about and swallowed.
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn(
      "[push] No EAS project ID (expo.extra.eas.projectId) — run `eas init`. Push notifications are off.",
    );
    return;
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const platform = Platform.OS === "ios" ? "ios" : "android";
    await registerPushToken(token, platform);
  } catch (err) {
    console.warn("[push] Could not register for push notifications:", err);
  }
}
