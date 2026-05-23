/**
 * Org Admin — Dashboard / Overview
 *
 * Shows a high-level overview of the organization:
 * - Total chapters, total members, active chapters
 * - Per-chapter quick stats (members, join code)
 * - Quick-access links to Chapters and Members management
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import type { Tables } from '@/types/database';

type Chapter = Tables<'organizations'> & { memberCount?: number };

const ORG_ADMIN_BLUE = '#3B82F6';

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, accent,
}: {
  label: string; value: string | number; sub?: string; accent?: boolean;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  return (
    <Card style={[styles.statCard, accent && { borderColor: ORG_ADMIN_BLUE }]}>
      <Text size="xs" weight="medium" color={c.textMuted}
        style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {label}
      </Text>
      <Text size="xxl" weight="bold"
        style={{ marginTop: 6, color: accent ? ORG_ADMIN_BLUE : c.text }}>
        {value}
      </Text>
      {sub && <Text size="xs" color={c.textSubtle} style={{ marginTop: 2 }}>{sub}</Text>}
    </Card>
  );
}

// ─── Chapter row ──────────────────────────────────────────────────────────────

function ChapterRow({ chapter, onPress }: { chapter: Chapter; onPress: () => void }) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chapterRow, { borderBottomColor: c.border, opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={[styles.chapterDot, { backgroundColor: chapter.primary_color ?? ORG_ADMIN_BLUE }]} />
      <View style={{ flex: 1 }}>
        <Text size="sm" weight="medium">{chapter.name}</Text>
        {chapter.institution && (
          <Text size="xs" color={c.textMuted} style={{ marginTop: 1 }}>{chapter.institution}</Text>
        )}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text size="sm" color={c.textMuted}>
          {chapter.memberCount ?? 0} member{chapter.memberCount !== 1 ? 's' : ''}
        </Text>
        {!chapter.is_active && (
          <View style={[styles.inactivePill, { borderColor: c.textSubtle }]}>
            <Text size="xs" color={c.textSubtle}>Inactive</Text>
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward-outline" size={16} color={c.textSubtle} />
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function OrgAdminDashboard() {
  const { theme }       = useThemeStore();
  const insets          = useSafeAreaInsets();
  const { width }       = useWindowDimensions();
  const isWide          = width >= 800;
  const { organization, profile } = useAuthStore();

  const [chapters, setChapters]   = useState<Chapter[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefresh]  = useState(false);

  const orgId = organization?.id;

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }

    // Fetch chapters under this parent org
    const { data: chaptersData } = await supabase
      .from('organizations')
      .select('*')
      .eq('parent_org_id', orgId)
      .eq('is_deleted', false)
      .order('name');

    if (!chaptersData) { setLoading(false); setRefresh(false); return; }

    // Fetch member counts per chapter
    const { data: memberCounts } = await supabase
      .from('memberships')
      .select('org_id')
      .in('org_id', chaptersData.map((c) => c.id))
      .eq('is_deleted', false)
      .eq('status', 'active');

    const countMap: Record<string, number> = {};
    for (const m of memberCounts ?? []) {
      countMap[m.org_id] = (countMap[m.org_id] ?? 0) + 1;
    }

    setChapters(chaptersData.map((ch) => ({ ...ch, memberCount: countMap[ch.id] ?? 0 })));
    setLoading(false);
    setRefresh(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const c = theme.colors;

  const totalMembers   = chapters.reduce((s, ch) => s + (ch.memberCount ?? 0), 0);
  const activeChapters = chapters.filter((ch) => ch.is_active).length;

  const firstName = profile?.first_name ?? '';
  const now       = new Date();
  const hour      = now.getHours();
  const greeting  = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={ORG_ADMIN_BLUE} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View style={[
        styles.header,
        { paddingTop: isWide ? 20 : insets.top + 12, backgroundColor: c.surface, borderBottomColor: c.border },
      ]}>
        <View>
          <Text size="xxl" weight="bold">Overview</Text>
          {organization && (
            <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>
              {organization.name}
            </Text>
          )}
        </View>
        {/* Blue org-admin badge */}
        <View style={[styles.badge, { backgroundColor: ORG_ADMIN_BLUE + '22', borderColor: ORG_ADMIN_BLUE }]}>
          <Ionicons name="shield-checkmark-outline" size={13} color={ORG_ADMIN_BLUE} />
          <Text size="xs" weight="medium" color={ORG_ADMIN_BLUE}>Org Admin</Text>
        </View>
      </View>

      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.scroll, isWide && styles.scrollWide, !isWide && { paddingBottom: insets.bottom + 24 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefresh(true); load(); }} tintColor={ORG_ADMIN_BLUE} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting */}
        <Text size="md" color={c.textMuted}>
          {greeting}, {firstName}. Managing{' '}
          <Text size="md" weight="semibold" color={c.text}>{organization?.name}</Text>.
        </Text>

        {/* Stats */}
        <View style={styles.statGrid}>
          <StatCard label="Chapters"        value={chapters.length}  sub="total"   accent />
          <StatCard label="Active chapters" value={activeChapters}   sub="currently active" />
          <StatCard label="Total members"   value={totalMembers}     sub="across all chapters" />
        </View>

        {/* Quick actions */}
        <View style={styles.quickRow}>
          {[
            { icon: 'business-outline' as const, label: 'Manage Chapters', route: '/(org-admin)/chapters' },
            { icon: 'people-outline'   as const, label: 'Move Members',    route: '/(org-admin)/members'  },
            { icon: 'add-circle-outline' as const, label: 'New Chapter',   route: '/(org-admin)/chapters' },
          ].map((item) => (
            <Pressable
              key={item.label}
              onPress={() => router.push(item.route as any)}
              style={({ pressed }) => [
                styles.quickBtn,
                { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Ionicons name={item.icon} size={22} color={ORG_ADMIN_BLUE} />
              <Text size="xs" color={c.textMuted} style={{ marginTop: 4, textAlign: 'center' }}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Chapters list */}
        <Text size="xs" weight="bold" color={c.textMuted}
          style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
          Chapters
        </Text>

        {chapters.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="business-outline" size={40} color={c.textSubtle} />
            <Text size="md" weight="medium" color={c.textMuted} style={{ marginTop: 12 }}>
              No chapters yet
            </Text>
            <Pressable
              onPress={() => router.push('/(org-admin)/chapters' as any)}
              style={{ marginTop: 12 }}
            >
              <Text size="sm" color={ORG_ADMIN_BLUE}>Create your first chapter →</Text>
            </Pressable>
          </View>
        ) : (
          <Card style={{ paddingVertical: 0 }}>
            {chapters.map((ch, i) => (
              <View
                key={ch.id}
                style={i < chapters.length - 1 ? { borderBottomWidth: 1, borderBottomColor: c.border } : undefined}
              >
                <ChapterRow
                  chapter={ch}
                  onPress={() => router.push('/(org-admin)/chapters' as any)}
                />
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  badge:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },

  scroll:     { padding: 20, gap: 20, paddingBottom: 48 },
  scrollWide: { paddingHorizontal: 48, maxWidth: 900, alignSelf: 'center', width: '100%' },

  statGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard:   { flex: 1, minWidth: '44%' },

  quickRow:   { flexDirection: 'row', gap: 10 },
  quickBtn:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, borderWidth: 1 },

  chapterRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  chapterDot:  { width: 12, height: 12, borderRadius: 6 },
  inactivePill:{ borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },

  emptyState: { alignItems: 'center', paddingVertical: 48 },
});
