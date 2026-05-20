import React from 'react';
import { Text as RNText, TextProps, TextStyle } from 'react-native';
import { useThemeStore } from '@/stores/themeStore';
import { AppTheme } from '@/lib/theme';

type SizeKey = keyof AppTheme['typography']['size'];
type WeightKey = keyof AppTheme['typography']['fontFamily'];

interface Props extends TextProps {
  size?: SizeKey;
  weight?: WeightKey;
  color?: string;
  style?: TextStyle | TextStyle[];
}

export function Text({
  size = 'md',
  weight = 'regular',
  color,
  style,
  ...props
}: Props) {
  const { theme } = useThemeStore();

  return (
    <RNText
      style={[
        {
          fontFamily: theme.typography.fontFamily[weight],
          fontSize: theme.typography.size[size],
          color: color ?? theme.colors.text,
          lineHeight: theme.typography.size[size] * theme.typography.lineHeight.normal,
        },
        style,
      ]}
      {...props}
    />
  );
}
