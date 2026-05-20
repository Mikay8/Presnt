import React from 'react';
import { View, ViewStyle } from 'react-native';
import { useThemeStore } from '@/stores/themeStore';

interface Props {
  style?: ViewStyle;
}

export function Divider({ style }: Props) {
  const { theme } = useThemeStore();

  return (
    <View
      style={[
        {
          height: 1,
          backgroundColor: theme.colors.border,
          width: '100%',
        },
        style,
      ]}
    />
  );
}
