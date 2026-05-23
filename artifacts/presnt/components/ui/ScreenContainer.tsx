import React from 'react';
import { Platform, ScrollView, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '@/stores/themeStore';

interface Props {
  children: React.ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
}

const WEB_TOP    = 67;
const WEB_BOTTOM = 34;

export function ScreenContainer({
  children,
  scroll = false,
  style,
  contentStyle,
}: Props) {
  const { theme } = useThemeStore();

  const bg = { backgroundColor: theme.colors.background };

  const webPad: ViewStyle = Platform.OS === 'web'
    ? { paddingTop: WEB_TOP, paddingBottom: WEB_BOTTOM }
    : {};

  if (scroll) {
    return (
      <SafeAreaView style={[{ flex: 1 }, bg, style]}>
        <ScrollView
          contentContainerStyle={[
            { padding: theme.spacing.md, flexGrow: 1 },
            webPad,
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
      <View style={[{ flex: 1, padding: theme.spacing.md }, webPad, contentStyle]}>
        {children}
      </View>
    </SafeAreaView>
  );
}
