import React, { useRef } from "react";
import { Animated, Pressable, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import { useNavigation, type CompositeNavigationProp } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import ProfileAvatar from "./ProfileAvatar";
import type { ThemeColors } from "../theme/colors";
import type { MainTabParamList } from "../navigation/MainTabNavigator";
import type { RootStackParamList } from "../navigation/AppNavigator";
import { useTour } from "../navigation/TourContext";

// Settings lives one level up, in the root stack that wraps the tab
// navigator — CompositeNavigationProp is what lets a screen inside a tab
// call .navigate("Settings") with that route type-checked, even though the
// nearest navigator (the tabs) doesn't own that route itself.
type Nav = CompositeNavigationProp<BottomTabNavigationProp<MainTabParamList>, NativeStackNavigationProp<RootStackParamList>>;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Every tab sets its title on a 31pt line starting 6pt below the safe area,
// so the line's centre is at insets.top + 21.5. The button is 32 tall, which
// puts its top half that height above the centre — that's what keeps the avatar
// optically inline with the title instead of riding above it.
export const HEADER_TITLE_TOP = 6;
const TOP_OFFSET = (insetTop: number) => insetTop + HEADER_TITLE_TOP + 31 / 2 - 32 / 2;
// Avatar disc that sits inside the 32×32 button — sized to leave a 2pt ring of
// the button's surfaceAlt background, which reads as a subtle frame.
const AVATAR_SIZE = 28;

type Props = {
  // Lets a screen animate the button in and out — HomeScreen keeps it out of
  // sight until the page has been scrolled. Where the button sits stays this
  // component's business; a caller only layers opacity/transform on top, and
  // takes `pointerEvents` off with it so an invisible button isn't still a
  // live tap target in the corner.
  style?: Animated.WithAnimatedValue<StyleProp<ViewStyle>>;
  pointerEvents?: ViewProps["pointerEvents"];
};

// Your profile avatar pinned to the top-right corner of every tab screen —
// replaces the old Settings tab, which now frees that slot for Bills. Tapping
// it opens Settings.
export default function SettingsButton({ style, pointerEvents }: Props) {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { currentUser, userFlat } = useAuth();
  const { registerTarget } = useTour();
  const ref = useRef<View>(null);

  if (!currentUser) return null;

  // User.photo and User.displayName live on the user row; the member colour
  // lives on the flat's membership row, so join it out of userFlat.members.
  // (Same pattern SettingsScreen already uses.)
  const myColor = userFlat?.members.find((m) => m.userId === currentUser.id)?.color ?? null;

  const handleLayout = () => {
    ref.current?.measureInWindow((x, y, width, height) => {
      registerTarget("settings-button", { x, y, width, height });
    });
  };

  return (
    <AnimatedPressable
      ref={ref}
      style={[
        styles.button,
        { top: TOP_OFFSET(insets.top), backgroundColor: colors.surfaceAlt },
        style,
      ]}
      pointerEvents={pointerEvents}
      onLayout={handleLayout}
      onPress={() => navigation.navigate("Settings")}
      hitSlop={10}
      accessibilityLabel="Settings"
    >
      <ProfileAvatar
        displayName={currentUser.displayName}
        color={myColor}
        photo={currentUser.photo}
        size={AVATAR_SIZE}
        fallbackOn={colors.text}
      />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
});