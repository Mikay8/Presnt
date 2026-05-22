import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  useFonts,
} from '@expo-google-fonts/space-grotesk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { Redirect, Stack, router, usePathname, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { DOMAIN, logEvent } from '@/lib/apiLogger';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useUserViewStore } from '@/stores/userViewStore';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// ─── User View banner ──────────────────────────────────────────────────────────
// Floats at the bottom of the screen whenever a user-view session is active.
// Pressing "Exit" calls stop() which clears the session and RootLayoutNav
// immediately redirects back to the superuser dashboard.

function UserViewBanner() {
  const { session, stop } = useUserViewStore();
  const insets = useSafeAreaInsets();
  if (!session) return null;

  function handleExit() {
    stop();
    router.replace('/(superuser)/support' as any);
  }

  const roleLabel = session.role === 'admin' ? 'Admin'
    : session.role === 'officer' ? 'Officer'
    : 'Member';

  return (
    <View style={{
      position: 'absolute',
      bottom: insets.bottom + 12,
      left: 16,
      right: 16,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#1C1411',
      borderWidth: 1,
      borderColor: '#E26B4A',
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 10,
      // shadow
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
      elevation: 10,
    }}>
      {/* Pulse dot */}
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#E26B4A' }} />

      <View style={{ flex: 1 }}>
        <Text style={{ color: '#FBF6EE', fontSize: 13, fontWeight: '600' }}>
          User View — {roleLabel}
        </Text>
        <Text style={{ color: '#A89687', fontSize: 11, marginTop: 1 }} numberOfLines={1}>
          {session.org.name}
          {session.role === 'officer' && session.permissions.length > 0
            ? ` · ${session.permissions.length} permission${session.permissions.length !== 1 ? 's' : ''}`
            : ''}
        </Text>
      </View>

      <Pressable
        onPress={handleExit}
        style={({ pressed }) => ({
          backgroundColor: pressed ? '#E26B4A' : '#E26B4A22',
          borderWidth: 1,
          borderColor: '#E26B4A',
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 6,
        })}
      >
        <Text style={{ color: '#E26B4A', fontSize: 13, fontWeight: '600' }}>Exit</Text>
      </Pressable>
    </View>
  );
}

// ─── Auth guard ────────────────────────────────────────────────────────────────
// Runs after isLoading:false. Uses pathname (always resolves to the real URL)
// rather than segments (which can be empty on initial render).

function RootLayoutNav() {
  const { session, profile, membership } = useAuthStore();
  const userView = useUserViewStore((s) => s.session);
  const segments = useSegments();
  const pathname = usePathname();

  const inAuth      = segments[0] === '(auth)';
  const inSuperuser = pathname === '/super-user' || pathname.startsWith('/(superuser)');

  // ── User View mode ──────────────────────────────────────────────────────────
  // Navigation is handled imperatively in the support screen (launch) and banner
  // (exit). Here we just suppress all redirects while a session is active so the
  // normal auth guards don't fight the simulated portal.
  if (userView) return null;

  // ── Normal auth flow ────────────────────────────────────────────────────────

  // Superuser routes manage their own auth — never redirect away from them
  if (inSuperuser) return null;

  // No session → send to login
  if (!session && !inAuth) {
    return <Redirect href="/(auth)/login" />;
  }

  // Superuser accounts have no chapter membership — route them to their dashboard
  if (session && profile?.is_superuser) {
    return <Redirect href="/(superuser)/" />;
  }

  // Session but no membership → needs onboarding
  if (session && !membership && !inAuth) {
    return <Redirect href="/(auth)/onboarding" />;
  }

  // Authenticated + membership on an auth screen → route to the correct portal
  if (session && membership && inAuth) {
    const role = membership.role;
    if (role === 'org_admin' || role === 'admin') {
      return <Redirect href="/(admin)/dashboard" />;
    }
    if (role === 'officer') {
      return <Redirect href="/(officer)/events-management" />;
    }
    return <Redirect href="/(member)" />;
  }

  return null;
}

// ─── Root layout ───────────────────────────────────────────────────────────────

export default function RootLayout() {
  const setOrgBranding = useThemeStore((s) => s.setOrgBranding);

  const {
    isLoading,
    setSession, setProfile, setMembership, setCustomRole, setLoading, clear,
  } = useAuthStore();

  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
  });

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

        // Log sign-in / sign-out events
        if (event === 'SIGNED_IN') {
          logEvent({ domain: DOMAIN.AUTH, method: 'POST', endpoint: 'auth/session', userId: session.user.id, statusCode: 200, responseMeta: { event } });
        }
        loadUserData(session, false); // silent refresh — no spinner
      } else {
        logEvent({ domain: DOMAIN.AUTH, method: 'POST', endpoint: 'auth/signout', statusCode: 200, responseMeta: { event } });
        clear();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // showSpinner = true only for the very first load on cold start
  async function loadUserData(session: Session, showSpinner: boolean) {
    if (showSpinner) setLoading(true);

    const t0 = Date.now();
    const [profileResult, membershipResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle(),                        // null (not error) when profile not yet created
      supabase
        .from('memberships')
        .select('*, organizations(*)')
        .eq('user_id', session.user.id)
        .eq('is_deleted', false)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),                        // null (not error) when no membership yet → onboarding
    ]);

    // Log profile fetch
    logEvent({
      domain: DOMAIN.MEMBERS, method: 'GET', endpoint: 'profiles',
      userId: session.user.id,
      status: profileResult.error ? 'error' : 'ok',
      statusCode: profileResult.error ? 500 : 200,
      durationMs: Date.now() - t0,
      responseMeta: { has_profile: !!profileResult.data },
      errorMessage: profileResult.error?.message,
    });

    const { data: profile }    = profileResult;
    const { data: membership } = membershipResult;

    if (profile) setProfile(profile);

    if (membership) {
      const { organizations: org, ...membershipOnly } = membership as typeof membership & {
        organizations: NonNullable<typeof membership>['organizations'];
      };
      setMembership(membershipOnly, org ?? null);

      if (org) {
        // Only override brand accent colors — not structural colors (background,
        // text) so the base light theme is always preserved.
        const branding: Record<string, string> = {};
        if (org.primary_color)   branding.primary   = org.primary_color;
        if (org.secondary_color) branding.secondary = org.secondary_color;
        if (org.accent_color)    branding.accent     = org.accent_color;
        if (Object.keys(branding).length > 0) setOrgBranding(branding);
      }

      // Load custom officer role if applicable
      if (membershipOnly.role === 'officer' && membershipOnly.custom_role_id) {
        const t1 = Date.now();
        const { data: orgRole, error: roleErr } = await supabase
          .from('org_roles')
          .select('id, name, color, permissions')
          .eq('id', membershipOnly.custom_role_id)
          .single();
        logEvent({
          domain: DOMAIN.ROLES, method: 'GET', endpoint: 'org_roles',
          userId: session.user.id, orgId: org?.id,
          status: roleErr ? 'error' : 'ok',
          statusCode: roleErr ? 500 : 200,
          durationMs: Date.now() - t1,
          errorMessage: roleErr?.message,
        });
        setCustomRole(orgRole ? {
          id:          orgRole.id,
          name:        orgRole.name,
          color:       orgRole.color,
          permissions: orgRole.permissions ?? [],
        } : null);
      } else {
        setCustomRole(null);
      }
    } else {
      setMembership(null, null);
      setCustomRole(null);
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
              <UserViewBanner />
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
