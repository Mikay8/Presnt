import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  useFonts,
} from '@expo-google-fonts/space-grotesk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { Redirect, Stack, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// ─── Auth guard ───────────────────────────────────────────────────────────────
// Only runs after isLoading:false (RootLayout returns null until then).
// Uses segment awareness so it only navigates when actually needed.

function RootLayoutNav() {
  const { session, membership } = useAuthStore();
  const segments = useSegments();

  const inAuth = segments[0] === '(auth)';

  // No session → must be on login/register/onboarding
  if (!session && !inAuth) {
    return <Redirect href="/(auth)/login" />;
  }

  // Session but no membership → needs to join/create a chapter
  if (session && !membership && !inAuth) {
    return <Redirect href="/(auth)/onboarding" />;
  }

  // Fully authenticated + has membership but sitting on auth screen → go home
  if (session && membership && inAuth) {
    return <Redirect href="/(member)" />;
  }

  // Already on the right screen — do nothing
  return null;
}

// ─── Root layout ──────────────────────────────────────────────────────────────

export default function RootLayout() {
  const systemScheme    = useColorScheme();
  const setColorScheme  = useThemeStore((s) => s.setColorScheme);
  const setOrgBranding  = useThemeStore((s) => s.setOrgBranding);

  const {
    isLoading,
    setSession, setProfile, setMembership, setLoading, clear,
  } = useAuthStore();

  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
  });

  // Sync system color scheme
  useEffect(() => {
    setColorScheme(systemScheme === 'light' ? 'light' : 'dark');
  }, [systemScheme]);

  // ── Only hide the splash screen after BOTH fonts AND auth check are done.
  //    This prevents the member home from flashing before the login redirect fires.
  useEffect(() => {
    if ((fontsLoaded || fontError) && !isLoading) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, isLoading]);

  // ── Auth state listener
  useEffect(() => {
    // Resolve initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        loadUserData(session);
      } else {
        setLoading(false);
      }
    });

    // Keep in sync with Supabase auth events (sign-in, sign-out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        loadUserData(session);
      } else {
        clear();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadUserData(session: Session) {
    setLoading(true);

    // Fetch both profile and membership in parallel
    const [profileResult, membershipResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single(),
      supabase
        .from('memberships')
        .select('*, organizations(*)')
        .eq('user_id', session.user.id)
        .eq('is_deleted', false)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
    ]);

    const { data: profile } = profileResult;
    const { data: membership } = membershipResult;

    if (profile) setProfile(profile);

    if (membership) {
      const { organizations: org, ...membershipOnly } = membership as typeof membership & {
        organizations: NonNullable<typeof membership>['organizations'];
      };
      setMembership(membershipOnly, org ?? null);

      if (org) {
        const branding: Record<string, string> = {};
        if (org.primary_color)    branding.primary    = org.primary_color;
        if (org.secondary_color)  branding.secondary  = org.secondary_color;
        if (org.accent_color)     branding.accent     = org.accent_color;
        if (org.background_color) branding.background = org.background_color;
        if (org.text_color)       branding.text       = org.text_color;
        if (Object.keys(branding).length > 0) setOrgBranding(branding);
      }
    } else {
      setMembership(null, null);
    }

    setLoading(false);
  }

  // ── Block rendering entirely until fonts AND auth resolve.
  //    The native splash screen (preventAutoHideAsync) covers this window —
  //    no blank or wrong-route flash is visible to the user.
  if (!fontsLoaded && !fontError) return null;
  if (isLoading) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(auth)"       />
                <Stack.Screen name="(member)"     />
                <Stack.Screen name="(officer)"    />
                <Stack.Screen name="(admin)"      />
                <Stack.Screen name="(superuser)"  />
                <Stack.Screen name="+not-found"   />
              </Stack>
              <RootLayoutNav />
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
