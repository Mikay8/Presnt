import React from 'react';
import { ScrollView, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '@/stores/themeStore';

interface Props {
  children: React.ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
}

export function ScreenContainer({
  children,
  scroll = false,
  style,
  contentStyle,
}: Props) {
  const { theme } = useThemeStore();

  const bg = { backgroundColor: theme.colors.background };

  if (scroll) {
    return (
      <SafeAreaView style={[{ flex: 1 }, bg, style]}>
        <ScrollView
          contentContainerStyle={[
            { padding: theme.spacing.md, flexGrow: 1 },
            contentStyle,
          ]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[{ flex: 1 }, bg, style]}>
      <View style={[{ flex: 1, padding: theme.spacing.md }, contentStyle]}>
        {children}
      </View>
    </SafeAreaView>
  );
}
