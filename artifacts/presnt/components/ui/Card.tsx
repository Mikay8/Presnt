import React from 'react';
import { View, ViewProps, ViewStyle } from 'react-native';
import { useThemeStore } from '@/stores/themeStore';

type ShadowSize = 'sm' | 'md' | 'lg';

interface Props extends ViewProps {
  shadow?: ShadowSize;
  alt?: boolean;
  style?: ViewStyle;
}

export function Card({ shadow, alt = false, style, children, ...props }: Props) {
  const { theme } = useThemeStore();

  return (
    <View
      style={[
        {
          backgroundColor: alt ? theme.colors.surfaceAlt : theme.colors.surface,
          borderRadius: theme.radius.md,
          padding: theme.spacing.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        shadow && theme.shadow[shadow],
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}
