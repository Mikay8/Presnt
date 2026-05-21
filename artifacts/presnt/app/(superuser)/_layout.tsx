import { Ionicons } from '@expo/vector-icons';
import { router, Stack, usePathname, Redirect } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

// ─── Superuser design tokens (always dark, never inherits org branding) ────────
export const su = {
  bg:         '#1C1411',
  surface:    '#272018',
  surfaceAlt: '#332820',
  text:       '#FBF6EE',
  textMuted:  '#A89687',
  textSubtle: '#6E5E54',
  border:     '#3D2B22',
  primary:    '#E26B4A',
  danger:     '#C0392B',
  warning:    '#C99432',
  success:    '#5C8A57',
};

// ─── Sidebar nav items ─────────────────────────────────────────────────────────
const NAV: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  href: string;
}[] = [
  { label: 'Overview',      icon: 'grid-outline',         href: '/(superuser)/' },
  { label: 'Orgs',          icon: 'business-outline',     href: '/(superuser)/orgs/' },
  { label: 'Users',         icon: 'people-outline',       href: '/(superuser)/users/' },
  { label: 'Billing',       icon: 'card-outline',         href: '/(superuser)/billing/' },
  { label: 'Feature flags', icon: 'flag-outline',         href: '/(superuser)/flags/' },
  { label: 'Logs & audit',  icon: 'document-text-outline',href: '/(superuser)/logs/' },
  { label: 'Support tools', icon: 'build-outline',        href: '/(superuser)/support/' },
  { label: 'App config',    icon: 'settings-outline',     href: '/(superuser)/config/' },
];

// ─── Auth guard ───────────────────────────────────────────────────────────────
function SuperuserGate() {
  return (
    <View style={{ flex: 1, backgroundColor: su.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Ionicons name="lock-closed" size={48} color={su.danger} />
      <Text style={{ color: su.text, fontSize: 22, fontWeight: '700', marginTop: 20, textAlign: 'center' }}>
        Access denied
      </Text>
      <Text style={{ color: su.textMuted, fontSize: 14, marginTop: 10, textAlign: 'center', lineHeight: 22 }}>
        This area is restricted to platform superusers only.{'\n'}
        Your account does not have the required access.
      </Text>
      <Pressable
        onPress={() => router.replace('/(member)')}
        style={{ marginTop: 28, borderWidth: 1, borderColor: su.border, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 }}
      >
        <Text style={{ color: su.textMuted, fontSize: 14 }}>← Back to app</Text>
      </Pressable>
    </View>
  );
}

// ─── Sidebar (desktop ≥ 800) ───────────────────────────────────────────────────
function Sidebar({ profile }: { profile: { first_name: string; last_name: string; email: string } | null }) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  function isActive(href: string) {
    if (href === '/(superuser)/') return pathname === '/(superuser)' || pathname === '/(superuser)/';
    return pathname.startsWith(href.replace(/\/$/, ''));
  }

  return (
    <View style={{
      width: 220,
      backgroundColor: su.bg,
      borderRightWidth: 1,
      borderRightColor: su.border,
      paddingTop: insets.top + 20,
      paddingBottom: insets.bottom + 20,
    }}>
      {/* Logo */}
      <View style={{ paddingHorizontal: 20, marginBottom: 28 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: su.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="checkmark" size={18} color="#fff" />
          </View>
          <Text style={{ color: su.text, fontSize: 18, fontWeight: '700' }}>presnt</Text>
        </View>
        <Text style={{ color: su.textSubtle, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 6, marginLeft: 40 }}>
          SUPER USER
        </Text>
      </View>

      {/* Nav */}
      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
        {NAV.map((item) => {
          const active = isActive(item.href);
          return (
            <Pressable
              key={item.href}
              onPress={() => router.push(item.href as any)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 16,
                paddingVertical: 11,
                marginHorizontal: 8,
                marginBottom: 2,
                borderRadius: 8,
                backgroundColor: active ? su.surfaceAlt : 'transparent',
              }}
            >
              <Ionicons
                name={item.icon}
                size={18}
                color={active ? su.primary : su.textMuted}
              />
              <Text style={{ color: active ? su.text : su.textMuted, fontSize: 14, fontWeight: active ? '600' : '400' }}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* User footer */}
      {profile && (
        <View style={{ paddingHorizontal: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: su.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: su.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: su.primary, fontSize: 13, fontWeight: '700' }}>
                {profile.first_name[0]}{profile.last_name[0]}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: su.text, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                {profile.first_name} {profile.last_name}
              </Text>
              <Text style={{ color: su.textSubtle, fontSize: 11 }} numberOfLines={1}>
                {profile.email}
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Mobile bottom tab bar ────────────────────────────────────────────────────
const MOBILE_TABS: typeof NAV = [
  { label: 'Overview',  icon: 'grid-outline',          href: '/(superuser)/' },
  { label: 'Orgs',      icon: 'business-outline',      href: '/(superuser)/orgs/' },
  { label: 'Logs',      icon: 'document-text-outline', href: '/(superuser)/logs/' },
  { label: 'Support',   icon: 'build-outline',         href: '/(superuser)/support/' },
  { label: 'More',      icon: 'ellipsis-horizontal',   href: '/(superuser)/config/' },
];

function MobileTabBar() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  return (
    <View style={{
      flexDirection: 'row',
      backgroundColor: su.bg,
      borderTopWidth: 1,
      borderTopColor: su.border,
      paddingBottom: insets.bottom,
    }}>
      {MOBILE_TABS.map((tab) => {
        const active = pathname.startsWith(tab.href.replace(/\/$/, '')) || (tab.href === '/(superuser)/' && (pathname === '/(superuser)' || pathname === '/(superuser)/'));
        return (
          <Pressable
            key={tab.href}
            onPress={() => router.push(tab.href as any)}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 10 }}
          >
            <Ionicons name={tab.icon} size={22} color={active ? su.primary : su.textSubtle} />
            <Text style={{ color: active ? su.primary : su.textSubtle, fontSize: 10, marginTop: 3 }}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Root layout ──────────────────────────────────────────────────────────────
export default function SuperuserLayout() {
  const { session, profile } = useAuthStore();
  const { width } = useWindowDimensions();
  const isWide = width >= 800;

  const [checking, setChecking] = useState(true);
  const [isSuperuser, setIsSuperuser] = useState(false);

  useEffect(() => {
    if (!session) { setChecking(false); return; }

    supabase
      .from('profiles')
      .select('is_superuser')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        setIsSuperuser(data?.is_superuser === true);
        setChecking(false);
      });
  }, [session]);

  if (!session) return <Redirect href="/(auth)/login" />;

  if (checking) {
    return (
      <View style={{ flex: 1, backgroundColor: su.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={su.primary} />
      </View>
    );
  }

  if (!isSuperuser) return <SuperuserGate />;

  const safeProfile = profile
    ? { first_name: profile.first_name, last_name: profile.last_name, email: profile.email }
    : null;

  return (
    <View style={{ flex: 1, flexDirection: isWide ? 'row' : 'column', backgroundColor: su.bg }}>
      {isWide && <Sidebar profile={safeProfile} />}

      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: su.bg } }} />
      </View>

      {!isWide && <MobileTabBar />}
    </View>
  );
}
