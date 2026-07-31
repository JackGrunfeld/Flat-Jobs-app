import * as Notifications from "expo-notifications";
import { getCompletionAlertsEnabled } from "../storage/preferences";

// Reimplements HomePage.jsx's fireCompletionAlert (browser Notification API)
// via expo-notifications. Same behavior as the web version: a local,
// immediate, self-confirmation alert when the current user completes their
// own chore — not a push to other flatmates (that's settlements' push flow).
export async function requestCompletionAlertPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function fireCompletionAlert(choreName: string): Promise<void> {
  const enabled = await getCompletionAlertsEnabled();
  if (!enabled) return;

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") return;

  await Notifications.scheduleNotificationAsync({
    content: { title: "Nice work!", body: `You marked "${choreName}" as done.` },
    trigger: null, // fire immediately
  });
}
