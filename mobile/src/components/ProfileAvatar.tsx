import React from "react";
import { View, Text, StyleSheet, Pressable, Image, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { withAlpha, onColor } from "../theme/colors";
import { fonts } from "../theme/fonts";
import { initialsFor } from "../utils/initials";

// A circular profile avatar. Shows the photo when the member has one; otherwise
// it falls back to their member colour as a fill with their initials — so the
// circle is never an empty space, and a flatmate who hasn't set a picture still
// reads as the same person across every tab.
//
// This is the single profile icon for the whole app (Settings, the dashboard,
// the bills ledger, list item cards), so it lives here rather than inlined in
// any one screen.
export type ProfileAvatarProps = {
  displayName: string;
  /** Hex the circle fills with when there's no photo. */
  color: string | null;
  /** Base64 `data:` URI from the user row. Null falls back to initials. */
  photo?: string | null;
  size?: number;
  /** Shows the camera-add badge and makes the whole circle pressable. */
  editable?: boolean;
  onPress?: () => void;
  /** Covers the circle with a spinner while a new photo is uploading. */
  busy?: boolean;
  /**
   * Fill used when the member has no colour of their own. Screens that draw
   * avatars on a block-coloured card pass their foreground colour so the
   * fallback sits against the card rather than the page.
   */
  fallbackOn?: string;
};

export default function ProfileAvatar({
  displayName,
  color,
  photo,
  size = 44,
  editable = false,
  onPress,
  busy = false,
  fallbackOn,
}: ProfileAvatarProps) {
  const { colors } = useTheme();
  // With a member colour the circle is a solid block, so the ink on it is
  // whichever of black/white that colour takes. Without one the circle is a
  // 30% wash of `fallbackOn` over whatever is behind it — there onColor has no
  // solid hex to measure, and `fallbackOn` itself is already the contrasting
  // ink for that surface, so it doubles as the initials colour.
  const fill = color ?? withAlpha(fallbackOn ?? colors.text, 0.3);
  const fg = color ? onColor(color) : (fallbackOn ?? colors.text);
  const badgeSize = size * 0.36;
  const circle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: fill,
  };

  // The photo/initials live in their own clipped circle so that the badge,
  // which overhangs the bottom-right corner, isn't cut off by the same
  // `overflow: hidden` that keeps a photo inside the round.
  const content = (
    <>
      <View style={[styles.clip, circle]}>
        {photo ? (
          <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} />
        ) : (
          <Text style={[styles.initials, { fontSize: size * 0.38, color: fg }]}>
            {initialsFor(displayName)}
          </Text>
        )}
        {busy && (
          <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: withAlpha(fill, 0.7) }]}>
            <ActivityIndicator size="small" color={fg} />
          </View>
        )}
      </View>
      {editable && !busy && (
        <View
          style={[
            styles.badge,
            {
              backgroundColor: fill,
              borderColor: colors.bg,
              width: badgeSize,
              height: badgeSize,
              borderRadius: badgeSize / 2,
            },
          ]}
        >
          <Ionicons name="camera" size={badgeSize * 0.55} color={fg} />
        </View>
      )}
    </>
  );

  if (editable && onPress) {
    return (
      <Pressable
        onPress={onPress}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={photo ? "Change your profile picture" : "Add a profile picture"}
        // The badge sits proud of the circle, so the press target has to be
        // padded out to it — otherwise the corner that reads as the button is
        // the one part of the control that isn't tappable.
        hitSlop={badgeSize / 2}
        style={({ pressed }) => [styles.root, { width: size, height: size }, { opacity: pressed ? 0.8 : 1 }]}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={[styles.root, { width: size, height: size }]}>{content}</View>;
}

const styles = StyleSheet.create({
  // Unclipped, so the badge can overhang the circle it sits on.
  root: {
    alignItems: "center",
    justifyContent: "center",
  },
  clip: {
    alignItems: "center",
    justifyContent: "center",
    // So a photo of any aspect fills the round rather than squaring off its
    // corners.
    overflow: "hidden",
  },
  initials: {
    fontFamily: fonts.bold,
    letterSpacing: 0.5,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    bottom: -1,
    right: -1,
    alignItems: "center",
    justifyContent: "center",
    // A ring in the page colour so the badge reads as a separate element
    // sitting on top of the circle rather than a notch cut out of it.
    borderWidth: 1.5,
  },
});
