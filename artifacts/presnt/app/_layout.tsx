import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  useFonts,
} from '@expo-google-fonts/space-grotesk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { Redirect, Stack, usePathname, useSegments } from 'expo-router';
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

// ─── Auth guard ────────────────────────────────────────────────────────────────
// Runs after isLoading:false. Uses pathname (always resolves to the real URL)
// rather than segments (which can be empty on initial render).

function RootLayoutNav() {
  const { session, membership } = useAuthStore();
  const segments = useSegments();
  const pathname = usePathname();

  const inAuth      = segments[0] === '(auth)';
  // pathname-based check is reliable even before segments resolve
  const inSuperuser = pathname === '/super-user'
                   || pathname.startsWith('/(superuser)');

  // Superuser routes manage their own auth — never redirect away from them
  if (inSuperuser) return null;

  // No session → send to login
  if (!session && !inAuth) {
    return <Redirect href="/(auth)/login" />;
  }

  // Session but no membership → needs onboarding
  if (session && !membership && !inAuth) {
    return <Redirect href="/(auth)/onboarding" />;
  }

  // Authenticated + membership but sitting on an auth screen → go home
  if (session && membership && inAuth) {
    return <Redirect href="/(member)" />;
  }

  return null;
}

// ─── Root layout ───────────────────────────────────────────────────────────────

export default function RootLayout() {
  const systemScheme   = useColorScheme();
  const setColorScheme = useThemeStore((s) => s.setColorScheme);
  const setOrgBranding = useThemeStore((s) => s.setOrgBranding);

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

  // Hide splash only after fonts + initial auth are both done
  useEffect(() => {
    if ((fontsLoaded || fontError) && !isLoading) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, isLoading]);

  // ── Auth listener ─────────────────────────────────────────────────────────
  useEffect(() => {
    // Resolve the initial session once on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        loadUserData(session, true);
      } else {
        setLoading(false);
      }
    });

    // React to auth events — but don't re-block the UI for token refreshes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session) {
        // TOKEN_REFRESHED fires on every window focus in dev and periodically
        // in prod. Silently update session but skip the full data reload +
        // loading spinner so the screen doesn't flash white.
        if (event === 'TOKEN_REFRESHED') return;
        loadUserData(session, false); // silent refresh — no spinner
      } else {
        clear();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // showSpinner = true only for the very first load on cold start
  async function loadUserData(session: Session, showSpinner: boolean) {
    if (showSpinner) setLoading(true);

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

    const { data: profile }    = profileResult;
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

    if (showSpinner) setLoading(false);
  }

  // Block render on cold start until fonts + first auth check are done.
  // TOKEN_REFRESHED events no longer trigger isLoading so this only fires once.
  if (!fontsLoaded && !fontError) return null;
  if (isLoading) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(auth)"      />
                <Stack.Screen name="(member)"    />
                <Stack.Screen name="(officer)"   />
                <Stack.Screen name="(admin)"     />
                <Stack.Screen name="(superuser)" />
                <Stack.Screen name="super-user"  />
                <Stack.Screen name="+not-found"  />
              </Stack>
              <RootLayoutNav />
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
