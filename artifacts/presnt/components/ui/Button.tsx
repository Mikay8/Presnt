import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { useThemeStore } from '@/stores/themeStore';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface Props extends PressableProps {
  variant?: Variant;
  size?: Size;
  label: string;
  loading?: boolean;
  style?: ViewStyle;
}

export function Button({
  variant = 'primary',
  size = 'md',
  label,
  loading = false,
  disabled,
  style,
  ...props
}: Props) {
  const { theme } = useThemeStore();

  const bgColor: Record<Variant, string> = {
    primary:   theme.colors.primary,
    secondary: theme.colors.surface,
    outline:   'transparent',
    ghost:     'transparent',
    danger:    theme.colors.error,
  };

  const textColor: Record<Variant, string> = {
    primary:   '#ffffff',
    secondary: theme.colors.text,
    outline:   theme.colors.text,
    ghost:     theme.colors.primary,
    danger:    '#ffffff',
  };

  const borderColor: Record<Variant, string | undefined> = {
    primary:   undefined,
    secondary: theme.colors.border,
    outline:   theme.colors.border,
    ghost:     undefined,
    danger:    undefined,
  };

  const paddingV: Record<Size, number> = { sm: 8, md: 12, lg: 16 };
  const paddingH: Record<Size, number> = { sm: 14, md: 20, lg: 28 };
  const textSize: Record<Size, 'sm' | 'md' | 'lg'> = { sm: 'sm', md: 'md', lg: 'lg' };

  return (
    <Pressable
      style={({ pressed }) => [
        {
          backgroundColor: bgColor[variant],
          borderRadius: theme.radius.md,
          paddingVertical: paddingV[size],
          paddingHorizontal: paddingH[size],
          borderWidth: borderColor[variant] ? 1 : 0,
          borderColor: borderColor[variant],
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          opacity: pressed || disabled ? 0.7 : 1,
        },
        style,
      ]}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <ActivityIndicator size="small" color={textColor[variant]} />
      )}
      <Text
        size={textSize[size]}
        weight="medium"
        color={textColor[variant]}
        style={{ opacity: loading ? 0 : 1 }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
