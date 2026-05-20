import React, { useState } from 'react';
import {
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { useThemeStore } from '@/stores/themeStore';
import { Text } from './Text';

interface Props extends TextInputProps {
  label?: string;
  error?: string;
  style?: ViewStyle;
}

export function Input({ label, error, style, ...props }: Props) {
  const { theme } = useThemeStore();
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? theme.colors.error
    : focused
    ? theme.colors.primary
    : theme.colors.border;

  return (
    <View style={[{ gap: 6 }, style]}>
      {label && (
        <Text size="sm" weight="medium" color={theme.colors.textMuted}>
          {label}
        </Text>
      )}
      <TextInput
        style={{
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor,
          borderRadius: theme.radius.md,
          paddingVertical: 12,
          paddingHorizontal: theme.spacing.md,
          fontFamily: theme.typography.fontFamily.regular,
          fontSize: theme.typography.size.md,
          color: theme.colors.text,
        }}
        placeholderTextColor={theme.colors.textSubtle}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...props}
      />
      {error && (
        <Text size="sm" color={theme.colors.error}>
          {error}
        </Text>
      )}
    </View>
  );
}
