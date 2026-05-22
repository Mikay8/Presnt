/**
 * /logout — Emergency escape hatch.
 *
 * Navigate to this URL (web: /logout, deep-link: presnt://logout) to
 * immediately sign out and clear all local auth state. Useful when the
 * app gets stuck in an auth loop.
 *
 * The component renders nothing visible — it just fires the sign-out on
 * mount and lets the root auth guard redirect to /login once the session
 * is cleared.
 */

import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

export default function LogoutScreen() {
  const clear = useAuthStore((s) => s.clear);

  useEffect(() => {
    (async () => {
      // Clear local store immediately so the UI updates right away
      clear();
      // Then tell Supabase to invalidate the session server-side
      await supabase.auth.signOut();
      // Navigate to login — redundant (the auth guard will do this too)
      // but provides instant feedback on slow connections
      router.replace('/(auth)/login');
    })();
  }, []);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator />
    </View>
  );
}
