import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { inkFor } from "../theme/cardInk";
import { fonts } from "../theme/fonts";
import { typeScale } from "../theme/typography";
import type { FlatMember } from "../types";

type Props = {
  members: FlatMember[];
  selectedIds: string[];
  onToggle: (userId: string) => void;
  placeholder?: string;
};

// A dropdown multi-select for flatmates, used by the add/edit pop-ups where a
// form needs to pick a set of people (chore rotation, expense split).
//
// "All" is the default and the resting state: an empty selection (or one that
// covers every member) reads as "All", and there is no "All" row in the
// dropdown — you either leave it as everyone, or pick the specific people you
// want. Tapping a member while in the "All" state switches to just that
// person; selecting everyone again returns to "All".
export default function MemberMultiSelect({ members, selectedIds, onToggle, placeholder = "All" }: Props) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  const isAll = selectedIds.length === 0 || selectedIds.length === members.length;
  const selectedMembers = members.filter((m) => selectedIds.includes(m.userId));
  const summary = isAll
    ? "All"
    : selectedMembers.map((m) => m.displayName.split(/\s+/)[0]).join(", ");

  return (
    <View>
      <Pressable
        style={[styles.trigger, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel="Select members"
      >
        <Text
          style={[styles.triggerText, { color: isAll ? colors.text : colors.text }]}
          numberOfLines={1}
        >
          {summary}
        </Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} />
      </Pressable>

      {open && (
        <View style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {members.map((m) => {
            // In the "All" state every member reads as selected, so the whole
            // list shows filled with their colours and checkmarks.
            const active = isAll || selectedIds.includes(m.userId);
            const fill = m.color ?? colors.accent;
            const ink = inkFor(fill).strong;
            return (
              <Pressable
                key={m.userId}
                style={[styles.option, active && { backgroundColor: fill }]}
                onPress={() => onToggle(m.userId)}
              >
                <Text style={[styles.optionText, { color: active ? ink : colors.text }]} numberOfLines={1}>
                  {m.displayName}
                </Text>
                {active && <Ionicons name="checkmark" size={16} color={ink} />}
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