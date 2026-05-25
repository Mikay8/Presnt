/**
 * (demo) — Root layout for the demo route group.
 *
 * This is intentionally minimal — it just renders child routes.
 * The DemoBanner floats above everything from _layout.tsx.
 */

import { Stack } from 'expo-router';

export default function DemoLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="admin" />
      <Stack.Screen name="member" />
    </Stack>
  );
}
