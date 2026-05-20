import React from 'react';
import { View, ViewStyle } from 'react-native';
import { useThemeStore } from '@/stores/themeStore';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'muted';

interface Props {
  label: string;
  variant?: Variant;
  style?: ViewStyle;
}

export function Badge({ label, variant = 'primary', style }: Props) {
  const { theme } = useThemeStore();

  const bg: Record<Variant, string> = {
    primary:   theme.colors.primary + '22',
    secondary: theme.colors.secondary + '22',
    success:   theme.colors.success + '22',
    warning:   theme.colors.warning + '22',
    error:     theme.colors.error + '22',
    muted:     theme.colors.textSubtle + '22',
  };

  const fg: Record<Variant, string> = {
    primary:   theme.colors.primary,
    secondary: theme.colors.secondary,
    success:   theme.colors.success,
    warning:   theme.colors.warning,
    error:     theme.colors.error,
    muted:     theme.colors.textMuted,
  };

  return (
    <View
      style={[
        {
          backgroundColor: bg[variant],
          borderRadius: theme.radius.full,
          paddingVertical: 3,
          paddingHorizontal: 10,
          alignSelf: 'flex-start',
        },
        style,
      ]}
    >
      <Text size="xs" weight="medium" color={fg[variant]}>
        {label}
      </Text>
    </View>
  );
}
