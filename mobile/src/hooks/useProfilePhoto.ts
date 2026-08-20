import { useState } from "react";
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../services/apiClient";

// The photo travels to the server inline on the user row as a base64 data URI
// (see the Worker's migration 0010), so the file that comes back off the
// picker — several megabytes of camera JPEG — can't be sent as-is. Everything
// here exists to get it down to something that can ride along on /auth/me:
// a square crop from the picker, then a 256px resize at moderate quality,
// which lands around 15–25KB of base64. 256 is twice the largest avatar the
// app draws, so it still looks sharp on a 3x screen.
const AVATAR_PX = 256;
const AVATAR_QUALITY = 0.8;

// Chosen to match the Worker's own 256KB cap. Hitting this means the resize
// above silently didn't take effect, so it's worth a clear message rather
// than a 400 from the API.
const MAX_DATA_URI_LENGTH = 256 * 1024;

// Picks an image, squares and shrinks it, and saves it to the account. Owns
// the "saving" flag so callers can disable their control while the upload is
// in flight, and reports its own failures — the caller only has to render.
export function useProfilePhoto() {
  const { currentUser, updatePhoto } = useAuth();
  const [saving, setSaving] = useState(false);

  const pickAndUpload = async () => {
    if (saving) return;

    // On iOS this is the limited-vs-full photo access prompt; `granted` is
    // true for either, since the picker itself is what the user then chooses
    // from. Only an outright denial needs handling.
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Photo access needed",
        "Allow photo access in Settings › Flatr to choose a profile picture.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      // The square crop happens here rather than in the manipulator so the
      // user chooses the framing — a centre crop of a group photo rarely
      // lands on the right face.
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (result.canceled || !result.assets?.length) return;

    setSaving(true);
    try {
      const context = ImageManipulator.manipulate(result.assets[0].uri);
      context.resize({ width: AVATAR_PX, height: AVATAR_PX });
      const rendered = await context.renderAsync();
      const image = await rendered.saveAsync({
        format: SaveFormat.JPEG,
        compress: AVATAR_QUALITY,
        base64: true,
      });
      if (!image.base64) throw new Error("no base64 output");

      const dataUri = `data:image/jpeg;base64,${image.base64}`;
      if (dataUri.length > MAX_DATA_URI_LENGTH) {
        throw new Error("resized image is still too large");
      }
      await updatePhoto(dataUri);
    } catch (err) {
      Alert.alert(
        "Couldn't save your photo",
        err instanceof ApiError ? err.message : "Something went wrong. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await updatePhoto(null);
    } catch (err) {
      Alert.alert(
        "Couldn't remove your photo",
        err instanceof ApiError ? err.message : "Something went wrong. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  // Both actions behind one tap: with a photo already set there's a third
  // option to take it off again, and without one there's nothing to remove.
  const edit = () => {
    if (!currentUser?.photo) {
      pickAndUpload();
      return;
    }
    Alert.alert("Profile picture", undefined, [
      { text: "Choose a new photo", onPress: pickAndUpload },
      { text: "Remove photo", style: "destructive", onPress: remove },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return { photo: currentUser?.photo ?? null, saving, edit, pickAndUpload, remove };
}
