import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { fonts } from "../theme/fonts";

// Floating-label input: the label sits inside the field like a placeholder,
// then shrinks and floats above it — in the accent color — on focus or once
// the field has a value. Adapted from the CSS "animated input label" pattern
// (no sibling selectors in RN, so this drives it off focus/value state).
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

type AnimatedInputProps = Omit<TextInputProps, "style" | "placeholder"> & {
  label: string;
  error?: boolean;
  accentColor?: string;
  idleBorderColor?: string;
  idleLabelColor?: string;
  idleTextColor?: string;
  backgroundColor?: string;
  fieldStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
};

export default function AnimatedInput({
  label,
  error,
  value,
  onFocus,
  onBlur,
  accentColor = "#ed4e04",
  idleBorderColor = "#9298a3",
  idleLabelColor = "#9298a3",
  idleTextColor = "#9298a3",
  backgroundColor = "transparent",
  fieldStyle,
  inputStyle,
  ...rest
}: AnimatedInputProps) {
  const [focused, setFocused] = useState(false);
  const floated = focused || !!value;
  const anim = useRef(new Animated.Value(floated ? 1 : 0)).current;
  const focusAnim = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: floated ? 1 : 0, duration: 200, useNativeDriver: false }).start();
  }, [floated, anim]);

  useEffect(() => {
    Animated.timing(focusAnim, { toValue: focused ? 1 : 0, duration: 200, useNativeDriver: false }).start();
  }, [focused, focusAnim]);

  const labelTop = anim.interpolate({ inputRange: [0, 1], outputRange: [12, -12] });
  const labelFontSize = anim.interpolate({ inputRange: [0, 1], outputRange: [14, 10] });
  const activeColor = error ? "#DC2626" : accentColor;
  const borderColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [error ? "#DC2626" : idleBorderColor, activeColor],
  });
  const labelColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [error ? "#DC2626" : idleLabelColor, activeColor],
  });
  // The text you type stays light gray until you click into the field, then
  // eases into the accent color — independent of the label/border float.
  const inputTextColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [error ? "#DC2626" : idleTextColor, activeColor],
  });

  return (
    <View style={styles.wrapper}>
      <Animated.Text style={[styles.label, { top: labelTop, fontSize: labelFontSize, color: labelColor }]}>
        {label}
      </Animated.Text>
      <Animated.View style={[styles.field, { borderColor, backgroundColor }, fieldStyle]}>
        <AnimatedTextInput
          {...rest}
          value={value}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, { color: inputTextColor }, inputStyle]}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginTop: 10 },
  field: { borderBottomWidth: 2 },
  input: { fontFamily: fonts.regular, paddingHorizontal: 2, paddingVertical: 8, fontSize: 14 },
  label: { fontFamily: fonts.regular, position: "absolute", left: 8, paddingHorizontal: 2, zIndex: 1 },
});
