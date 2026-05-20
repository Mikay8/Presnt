import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  useFonts,
} from '@expo-google-fonts/space-grotesk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { Redirect, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useState } from 'react';
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

function RootLayoutNav() {
  const { session, membership, isLoading } = useAuthStore();

  if (isLoading) return null;

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  // If authenticated but no membership, go to onboarding to create/join a chapter
  if (!membership) {
    return <Redirect href="/(auth)/onboarding" />;
  }

  // Role-based redirect — placeholder until Phase 2 roles are built
  // For now all members go to the member tab group
  return <Redirect href="/(member)" />;
}

export default function RootLayout() {
  const systemScheme = useColorScheme();
  const setColorScheme = useThemeStore((s) => s.setColorScheme);
  const { setSession, setProfile, setMembership, setLoading, clear } = useAuthStore();
  const setOrgBranding = useThemeStore((s) => s.setOrgBranding);

  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
  });

  useEffect(() => {
    setColorScheme(systemScheme === 'light' ? 'light' : 'dark');
  }, [systemScheme]);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    // Initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        loadUserData(session);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
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

    // Load profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (profile) setProfile(profile);

    // Load most recent active membership + org
    const { data: membership } = await supabase
      .from('memberships')
      .select('*, organizations(*)')
      .eq('user_id', session.user.id)
      .eq('is_deleted', false)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (membership) {
      const { organizations: org, ...membershipOnly } = membership as typeof membership & {
        organizations: NonNullable<typeof membership>['organizations'];
      };
      setMembership(membershipOnly, org ?? null);

      // Apply org branding to theme
      if (org) {
        const branding: Record<string, string> = {};
        if (org.primary_color) branding.primary = org.primary_color;
        if (org.secondary_color) branding.secondary = org.secondary_color;
        if (org.accent_color) branding.accent = org.accent_color;
        if (org.background_color) branding.background = org.background_color;
        if (org.text_color) branding.text = org.text_color;
        if (Object.keys(branding).length > 0) setOrgBranding(branding);
      }
    } else {
      setMembership(null, null);
    }

    setLoading(false);
  }

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(member)" />
                <Stack.Screen name="(officer)" />
                <Stack.Screen name="(admin)" />
                <Stack.Screen name="+not-found" />
              </Stack>
              <RootLayoutNav />
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
