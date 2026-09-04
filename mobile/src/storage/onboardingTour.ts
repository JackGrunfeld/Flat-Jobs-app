import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_PREFIX = "onboarding_tour_seen:";

// Whether this device has already run the guided walkthrough for this
// account. Keyed per user id (not global) so a second account signing in on
// the same device still gets its own first run. If storage throws for any
// reason, this reads as "seen" — a broken read should never repeatedly nag
// someone with the tour, only silently skip it.
export async function hasSeenTour(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY_PREFIX + userId)) === "1";
  } catch {
    return true;
  }
}

export async function markTourSeen(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_PREFIX + userId, "1");
  } catch {
    // Best-effort — worst case the tour runs again next launch.
  }
}
