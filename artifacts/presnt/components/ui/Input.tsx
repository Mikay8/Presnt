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
  rightElement?: React.ReactNode;
}

export function Input({ label, error, style, rightElement, ...props }: Props) {
  const { theme } = useThemeStore();
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? theme.colors.error
    : focused
    ? theme.colors.primary
    : theme.colors.border;

  const borderWidth = focused || !!error ? 2 : 1;

  return (
    <View style={[{ gap: 6 }, style]}>
      {label && (
        <Text size="sm" weight="medium" color={theme.colors.textMuted}>
          {label}
        </Text>
      )}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: theme.colors.surface,
          borderWidth,
          borderColor,
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.spacing.md,
        }}
      >
        <TextInput
          style={{
            flex: 1,
            paddingVertical: 12,
            fontFamily: theme.typography.fontFamily.regular,
            fontSize: theme.typography.size.md,
            color: theme.colors.text,
            // Remove the browser's native blue focus outline on web
            // @ts-ignore — web-only property
            outline: 'none',
          }}
          placeholderTextColor={theme.colors.textSubtle}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...props}
        />
        {rightElement && (
          <View style={{ paddingLeft: 8 }}>{rightElement}</View>
        )}
      </View>
      {error && (
        <Text size="sm" color={theme.colors.error}>
          {error}
        </Text>
      )}
    </View>
  );
}
