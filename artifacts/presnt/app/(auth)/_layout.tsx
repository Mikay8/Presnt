import { Stack } from 'expo-router';
import { useThemeStore } from '@/stores/themeStore';

export default function AuthLayout() {
  const { theme } = useThemeStore();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
        animation: 'fade',
      }}
    />
  );
}
