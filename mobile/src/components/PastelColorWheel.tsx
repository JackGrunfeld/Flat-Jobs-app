import React, { useMemo } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { WHEEL_BASE_SEGMENTS, WHEEL_RINGS, wheelSwatchHex } from "../theme/pastels";

type Dot = { key: string; hex: string; x: number; y: number };

// Lays the wheel out in polar coordinates: ring `i` sits at `ringSpacing * i`
// and holds BASE * i dots, which keeps both the radial and the angular gap a
// fixed multiple of ringSpacing — one dot diameter serves the whole wheel.
function buildDots(size: number): { dots: Dot[]; diameter: number } {
  const centre = size / 2;
  const ringSpacing = centre / (WHEEL_RINGS + 1);
  const diameter = ringSpacing * 0.82;
  const dots: Dot[] = [{ key: "0-0", hex: wheelSwatchHex(0, 0), x: centre, y: centre }];

  for (let ring = 1; ring <= WHEEL_RINGS; ring += 1) {
    const segments = WHEEL_BASE_SEGMENTS * ring;
    const radius = ringSpacing * ring;
    for (let index = 0; index < segments; index += 1) {
      // Start at 12 o'clock rather than 3, so the hue sweep reads clockwise
      // from the top the way a colour wheel is normally drawn.
      const angle = (index / segments) * 2 * Math.PI - Math.PI / 2;
      dots.push({
        key: `${ring}-${index}`,
        hex: wheelSwatchHex(ring, index),
        x: centre + radius * Math.cos(angle),
        y: centre + radius * Math.sin(angle),
      });
    }
  }

  return { dots, diameter };
}

export default function PastelColorWheel({
  size,
  value,
  onSelect,
  selectedBorderColor,
}: {
  size: number;
  value: string | null;
  onSelect: (hex: string) => void;
  selectedBorderColor: string;
}) {
  const { dots, diameter } = useMemo(() => buildDots(size), [size]);
  const selected = value?.toLowerCase() ?? null;

  return (
    <View style={{ width: size, height: size }}>
      {dots.map((dot) => (
        <Pressable
          key={dot.key}
          onPress={() => onSelect(dot.hex)}
          hitSlop={4}
          style={[
            styles.dot,
            {
              left: dot.x - diameter / 2,
              top: dot.y - diameter / 2,
              width: diameter,
              height: diameter,
              borderRadius: diameter / 2,
              backgroundColor: dot.hex,
            },
            dot.hex === selected && { borderWidth: 3, borderColor: selectedBorderColor },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { position: "absolute" },
});
