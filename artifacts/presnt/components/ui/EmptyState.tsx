import React from 'react';
import { View, ViewStyle } from 'react-native';
import { useThemeStore } from '@/stores/themeStore';
import { Text } from './Text';

interface Props {
  icon?: React.ReactNode;
  title: string;
  message?: string;
  action?: React.ReactNode;
  style?: ViewStyle;
}

export function EmptyState({ icon, title, message, action, style }: Props) {
  const { theme } = useThemeStore();

  return (
    <View
      style={[
        {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: theme.spacing.xxl,
          gap: theme.spacing.sm,
        },
        style,
      ]}
    >
      {icon && <View style={{ marginBottom: theme.spacing.sm }}>{icon}</View>}
      <Text size="lg" weight="medium" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {message && (
        <Text size="md" color={theme.colors.textMuted} style={{ textAlign: 'center' }}>
          {message}
        </Text>
      )}
      {action && <View style={{ marginTop: theme.spacing.md }}>{action}</View>}
    </View>
  );
}
