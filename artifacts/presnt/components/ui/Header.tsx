import React from 'react';
import { Image, Pressable, View, ViewStyle } from 'react-native';
import { useThemeStore } from '@/stores/themeStore';
import { Text } from './Text';

interface Props {
  title?: string;
  showLogo?: boolean;
  rightAction?: React.ReactNode;
  onBack?: () => void;
  style?: ViewStyle;
}

export function Header({
  title,
  showLogo = false,
  rightAction,
  onBack,
  style,
}: Props) {
  const { theme } = useThemeStore();

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.sm,
          backgroundColor: theme.colors.background,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          minHeight: 52,
        },
        style,
      ]}
    >
      <View style={{ flex: 1, alignItems: 'flex-start' }}>
        {onBack && (
          <Pressable onPress={onBack} hitSlop={12}>
            <Text size="md" color={theme.colors.primary}>‹ Back</Text>
          </Pressable>
        )}
      </View>

      <View style={{ alignItems: 'center' }}>
        {showLogo ? (
          <Image
            source={require('../../assets/images/wordmark-dark.svg')}
            style={{ height: 24, width: 80 }}
            resizeMode="contain"
          />
        ) : (
          <Text size="lg" weight="bold">{title}</Text>
        )}
      </View>

      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        {rightAction}
      </View>
    </View>
  );
}
