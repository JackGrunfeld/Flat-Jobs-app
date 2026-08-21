import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { fonts } from "../theme/fonts";
import { typeScale } from "../theme/typography";

type Props<T extends string> = {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  placeholder?: string;
};

// A single-select dropdown for a fixed set of options (chore frequency,
// expense category). Collapsed it shows the current value; tapping expands a
// list of options with the active one marked, each row tappable to select.
export default function SelectDropdown<T extends string>({
  options,
  value,
  onChange,
  placeholder = "Select",
}: Props<T>) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View>
      <Pressable
        style={[styles.trigger, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel="Select option"
      >
        <Text style={[styles.triggerText, { color: value ? colors.text : colors.textMuted }]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} />
      </Pressable>

      {open && (
        <View style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {options.map((option) => {
            const active = option === value;
            return (
              <Pressable
                key={option}
                style={[styles.option, active && { backgroundColor: colors.accent }]}
                onPress={() => {
                  onChange(option);
                  setOpen(false);
                }}
              >
                <Text style={[styles.optionText, { color: active ? colors.accentText : colors.text }]} numberOfLines={1}>
                  {option}
                </Text>
                {active && <Ionicons name="checkmark" size={16} color={colors.accentText} />}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  triggerText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: typeScale.body,
  },
  dropdown: {
    marginTop: 6,
    borderWidth: 1.5,
    borderRadius: 12,
    overflow: "hidden",
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  optionText: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: typeScale.body,
  },
});