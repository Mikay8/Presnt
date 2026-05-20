import React from 'react';
import { ActivityIndicator, View, ViewStyle } from 'react-native';
import { useThemeStore } from '@/stores/themeStore';

interface Props {
  size?: 'small' | 'large';
  color?: string;
  style?: ViewStyle;
}

export function LoadingSpinner({ size = 'large', color, style }: Props) {
  const { theme } = useThemeStore();

  return (
    <View
      style={[
        { flex: 1, alignItems: 'center', justifyContent: 'center' },
        style,
      ]}
    >
      <ActivityIndicator size={size} color={color ?? theme.colors.primary} />
    </View>
  );
}
