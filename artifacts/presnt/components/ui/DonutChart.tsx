import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useThemeStore } from '@/stores/themeStore';
import { Text } from './Text';

interface Props {
  percent: number;       // 0–100
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  showLabel?: boolean;
  sublabel?: string;     // optional text below the %
}

export function DonutChart({
  percent,
  size = 180,
  strokeWidth = 18,
  color,
  trackColor,
  showLabel = true,
  sublabel,
}: Props) {
  const { theme } = useThemeStore();
  const fillColor  = color      ?? theme.colors.primary;
  const trackFill  = trackColor ?? theme.colors.surfaceAlt;

  const r            = (size - strokeWidth) / 2;
  const cx           = size / 2;
  const cy           = size / 2;
  const circumference = 2 * Math.PI * r;
  const clamped       = Math.min(100, Math.max(0, percent));
  const dashOffset    = circumference * (1 - clamped / 100);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {/* Track */}
        <Circle
          cx={cx} cy={cy} r={r}
          stroke={trackFill}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress arc */}
        <Circle
          cx={cx} cy={cy} r={r}
          stroke={fillColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </Svg>

      {showLabel && (
        <View style={{ alignItems: 'center' }}>
          <Text size="h1" weight="bold">{Math.round(clamped)}%</Text>
          {sublabel ? (
            <Text size="xs" color={theme.colors.textMuted} style={{ marginTop: 2 }}>
              {sublabel}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}
