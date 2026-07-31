import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { registerPushToken } from "../services/pushTokensService";

// Registers this device for real cross-device push (settlement notifications
// — distinct from the local-only completionAlerts). Called on login and app
// foreground since the underlying token can rotate.
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

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );

  const platform = Platform.OS === "ios" ? "ios" : "android";
  await registerPushToken(token, platform);
}
