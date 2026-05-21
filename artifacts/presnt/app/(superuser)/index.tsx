import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { su } from './_layout';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Stats {
  totalOrgs: number;
  totalUsers: number;
  activeOrgs: number;
}

interface HealthItem {
  label: string;
  value: string;
  status: 'healthy' | 'degraded' | 'down';
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, accent = false,
}: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <View style={{
      flex: 1, minWidth: 140,
      backgroundColor: accent ? su.primary : su.surface,
      borderRadius: 12, padding: 18,
      borderWidth: 1, borderColor: accent ? su.primary : su.border,
    }}>
      <Text style={{ color: accent ? '#fff' : su.textMuted, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase' }}>
        {label}
      </Text>
      <Text style={{ color: accent ? '#fff' : su.text, fontSize: 28, fontWeight: '700', marginTop: 8 }}>
        {value}
      </Text>
      {sub && (
        <Text style={{ color: accent ? 'rgba(255,255,255,0.7)' : su.textSubtle, fontSize: 12, marginTop: 4 }}>
          {sub}
        </Text>
      )}
    </View>
  );
}

// ─── Quick-access card ────────────────────────────────────────────────────────
function QuickCard({
  icon, title, sub, href,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  sub: string;
  href: string;
}) {
  return (
    <Pressable
      onPress={() => router.push(href as any)}
      style={({ pressed }) => ({
        flex: 1, minWidth: 160,
        backgroundColor: pressed ? su.surfaceAlt : su.surface,
        borderRadius: 12, padding: 16,
        borderWidth: 1, borderColor: su.border,
        gap: 10,
      })}
    >
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: su.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={18} color={su.primary} />
      </View>
      <View>
        <Text style={{ color: su.text, fontSize: 14, fontWeight: '600' }}>{title}</Text>
        <Text style={{ color: su.textSubtle, fontSize: 12, marginTop: 3, lineHeight: 18 }}>{sub}</Text>
      </View>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function SuperuserOverview() {
  const { profile } = useAuthStore();
  const { width } = useWindowDimensions();
  const isWide = width >= 800;

  const [stats, setStats] = useState<Stats | null>(null);
  const [health, setHealth] = useState<HealthItem[]>([
    { label: 'API',           value: '—',  status: 'healthy' },
    { label: 'Postgres',      value: '—',  status: 'healthy' },
    { label: 'Auth service',  value: '—',  status: 'healthy' },
  ]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    setLoading(true);
    const [{ count: orgsCount }, { count: usersCount }, { count: activeOrgsCount }] = await Promise.all([
      supabase.from('organizations').select('*', { count: 'exact', head: true }).eq('is_deleted', false),
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('organizations').select('*', { count: 'exact', head: true }).eq('is_deleted', false).eq('is_active', true),
    ]);
    setStats({
      totalOrgs: orgsCount ?? 0,
      totalUsers: usersCount ?? 0,
      activeOrgs: activeOrgsCount ?? 0,
    });
    setLoading(false);
  }

  const firstName = profile?.first_name ?? 'there';
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: su.bg }}
      contentContainerStyle={{ padding: isWide ? 32 : 16, paddingBottom: 48 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <Text style={{ color: su.textMuted, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' }}>
        PLATFORM OVERVIEW
      </Text>
      <Text style={{ color: su.text, fontSize: 30, fontWeight: '700', marginTop: 6 }}>
        {greeting}, {firstName}.
      </Text>
      <Text style={{ color: su.textMuted, fontSize: 13, marginTop: 4, marginBottom: 28 }}>
        {dateStr} · {stats ? `${stats.totalOrgs} orgs · ${stats.totalUsers} members` : '...'}
      </Text>

      {/* Stat cards */}
      {loading ? (
        <ActivityIndicator color={su.primary} style={{ marginBottom: 32 }} />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
          <StatCard label="Active orgs"  value={String(stats?.activeOrgs ?? 0)}  sub="on platform"  accent />
          <StatCard label="Total orgs"   value={String(stats?.totalOrgs ?? 0)}   sub="incl. inactive" />
          <StatCard label="Total users"  value={String(stats?.totalUsers ?? 0)}  sub="all time" />
          <StatCard label="Error rate"   value="—"   sub="last 24h" />
        </View>
      )}

      {/* System health + quick access (side by side on desktop) */}
      <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 20, marginBottom: 28 }}>
        {/* Quick access cards */}
        <View style={{ flex: 2 }}>
          <Text style={{ color: su.textMuted, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 14 }}>
            QUICK ACCESS
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <QuickCard icon="business-outline"      title="Org management"   sub={`${stats?.totalOrgs ?? '—'} orgs`}     href="/(superuser)/orgs/" />
            <QuickCard icon="people-outline"        title="User management"  sub={`${stats?.totalUsers ?? '—'} profiles`} href="/(superuser)/users/" />
            <QuickCard icon="flag-outline"          title="Feature flags"    sub="Toggles & overrides"                    href="/(superuser)/flags/" />
            <QuickCard icon="document-text-outline" title="Logs & audit"     sub="Platform · per-org"                     href="/(superuser)/logs/" />
            <QuickCard icon="build-outline"         title="Support tools"    sub="Overrides · QR · push"                  href="/(superuser)/support/" />
            <QuickCard icon="settings-outline"      title="App config"       sub="Limits · defaults"                      href="/(superuser)/config/" />
          </View>
        </View>

        {/* System health */}
        <View style={{ flex: 1, minWidth: 200 }}>
          <Text style={{ color: su.textMuted, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 14 }}>
            SYSTEM HEALTH
          </Text>
          <View style={{ backgroundColor: su.surface, borderRadius: 12, borderWidth: 1, borderColor: su.border, padding: 16, gap: 14 }}>
            {health.map((item) => (
              <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{
                    width: 8, height: 8, borderRadius: 4,
                    backgroundColor: item.status === 'healthy' ? su.success : item.status === 'degraded' ? su.warning : su.danger,
                  }} />
                  <Text style={{ color: su.text, fontSize: 14 }}>{item.label}</Text>
                </View>
                <Text style={{ color: su.textSubtle, fontSize: 13 }}>{item.value}</Text>
              </View>
            ))}
            <Text style={{ color: su.textSubtle, fontSize: 11, marginTop: 4 }}>
              Polling every 30s
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
