import { Hono } from "hono";
import type { AppEnv } from "../types";

const appleNotifications = new Hono<AppEnv>();

// Apple server-to-server notifications endpoint
// Apple sends POST requests here for account status changes
// https://developer.apple.com/documentation/apple_sign_in/server-to-server_notifications
// No auth required here - Apple doesn't send bearer tokens, but sends
// notifications with the payload containing the user ID.
// The JWT is signed by Apple and can be verified with Apple's keys.
appleNotifications.post("/", async (c) => {
  const body = await c.req.json();
  
  // Apple sends notifications with this structure:
  // {
  //   "notification": {
  //     "bundleId": "com.flatjobs.app",
  //     "notificationType": "accountDelete" | "emailChanged" | etc,
  //     "data": {
  //       "userId": "..."
  //     },
  //     "signingDate": "2023-..."
  //   }
  // }
  // But for simple verification/testing, we also handle direct payloads
  
  const notification = body.notification ?? body;
  const type = notification.notificationType ?? notification.type ?? "unknown";
  const uid = notification.data?.userId ?? notification.uid ?? "unknown";
  
  // Handle different notification types
  switch (type) {
    case "accountDelete":
    case "account_delete":
      // User deleted their Apple Account
      console.log(`[Apple] Account delete notification for user: ${uid}`);
      break;
      
    case "emailChanged":
    case "mail_change":
      // User changed mail forwarding preferences
      console.log(`[Apple] Mail change notification for user: ${uid}`);
      break;
      
    case "deleteFromServer":
    case "delete_from_server":
      // User deleted their app account
      console.log(`[Apple] App delete notification for user: ${uid}`);
      break;
      
    case "emailVended":
    case "email_vended":
      // User shared an email
      console.log(`[Apple] Email vended notification for user: ${uid}`);
      break;
      
    default:
      console.log(`[Apple] Unknown notification type: ${type} for user: ${uid}`);
  }
  
  // Apple requires a 200 OK response within 10 seconds
  return c.json({ success: true }, 200);
});

export default appleNotifications;