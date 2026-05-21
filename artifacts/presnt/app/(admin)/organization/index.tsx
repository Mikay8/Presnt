/**
 * Admin — Organization Management
 *
 * Shows the parent organization this chapter belongs to (if any),
 * lists all sibling chapters, and lets org admins create new chapters.
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
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';

type OrgRow = {
  id: string;
  name: string;
  type: string;
  slug: string;
  institution: string | null;
  join_code: string | null;
  is_active: boolean | null;
  created_at: string | null;
};

export default function OrganizationAdminScreen() {
  const { theme }    = useThemeStore();
  const { organization, membership } = useAuthStore();
  const insets       = useSafeAreaInsets();
  const { width }    = useWindowDimensions();
  const isWide       = width >= 800;

  const [parentOrg, setParentOrg]   = useState<OrgRow | null>(null);
  const [chapters, setChapters]     = useState<OrgRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);

  const load = useCallback(async () => {
    if (!organization?.id) { setLoading(false); return; }

    // Check if user is org_admin
    if (membership?.role === 'org_admin') setIsOrgAdmin(true);

    // Fetch the current organization row to get parent_org_id
    const { data: currentOrg } = await supabase
      .from('organizations')
      .select('id, name, type, slug, institution, join_code, is_active, created_at, parent_org_id')
      .eq('id', organization.id)
      .single();

    const parentId = currentOrg?.parent_org_id ?? null;

    // Fetch parent org (if any)
    if (parentId) {
      const { data: parent } = await supabase
        .from('organizations')
        .select('id, name, type, slug, institution, join_code, is_active, created_at')
        .eq('id', parentId)
        .single();
      setParentOrg(parent ?? null);

      // Fetch all chapters under the same parent
      const { data: siblings } = await supabase
        .from('organizations')
        .select('id, name, type, slug, institution, join_code, is_active, created_at')
        .eq('parent_org_id', parentId)
        .eq('is_deleted', false)
        .order('name');
      setChapters(siblings ?? []);
    } else {
      // This org IS the top-level — list its children
      setParentOrg(null);
      const { data: children } = await supabase
        .from('organizations')
        .select('id, name, type, slug, institution, join_code, is_active, created_at')
        .eq('parent_org_id', organization.id)
        .eq('is_deleted', false)
        .order('name');
      setChapters(children ?? []);
    }

    setLoading(false);
    setRefreshing(false);
  }, [organization?.id, membership?.role]);

  useEffect(() => { load(); }, [load]);

  function onRefresh() {
    setRefreshing(true);
    load();
  }

  const c = theme.colors;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <Text size="xxl" weight="bold" color={c.text}>Organization</Text>
        {isOrgAdmin && (
          <Pressable
            onPress={() => router.push('/(auth)/create-chapter')}
            style={[styles.addBtn, { backgroundColor: c.primary }]}
          >
            <Ionicons name="add" size={16} color="#fff" />
            <Text size="sm" weight="bold" style={{ color: '#fff' }}>New chapter</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, isWide && styles.scrollWide]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Parent org card */}
        {parentOrg ? (
          <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="globe-outline" size={18} color={c.primary} />
              <Text size="xs" weight="bold" color={c.textMuted} style={styles.sectionLabel}>
                PARENT ORGANIZATION
              </Text>
            </View>
            <Text size="lg" weight="bold" color={c.text}>{parentOrg.name}</Text>
            <Text size="sm" color={c.textMuted} style={{ textTransform: 'capitalize' }}>
              {parentOrg.type.replace('_', ' ')}
            </Text>
          </View>
        ) : (
          /* Standalone org — show its own info */
          <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="globe-outline" size={18} color={c.primary} />
              <Text size="xs" weight="bold" color={c.textMuted} style={styles.sectionLabel}>
                YOUR ORGANIZATION
              </Text>
            </View>
            <Text size="lg" weight="bold" color={c.text}>{organization?.name ?? '—'}</Text>
            <Text size="sm" color={c.textMuted}>
              This chapter has no parent organization.
            </Text>
          </View>
        )}

        {/* Current chapter join code */}
        <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="key-outline" size={18} color={c.primary} />
            <Text size="xs" weight="bold" color={c.textMuted} style={styles.sectionLabel}>
              YOUR CHAPTER JOIN CODE
            </Text>
          </View>
          <View style={styles.codeRow}>
            <Text size="xl" weight="bold" color={c.primary} style={{ letterSpacing: 2 }}>
              {/* We need to fetch this chapter's join_code */}
              <JoinCodeInline orgId={organization?.id ?? ''} color={c.primary} />
            </Text>
          </View>
          <Text size="xs" color={c.textMuted}>
            Share this code with members so they can find and join your chapter.
          </Text>
        </View>

        {/* Chapters list */}
        {chapters.length > 0 && (
          <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={[styles.sectionHeader, { marginBottom: 4 }]}>
              <Ionicons name="business-outline" size={18} color={c.primary} />
              <Text size="xs" weight="bold" color={c.textMuted} style={styles.sectionLabel}>
                CHAPTERS ({chapters.length})
              </Text>
            </View>

            {chapters.map((ch, i) => (
              <View key={ch.id}>
                {i > 0 && <View style={[styles.divider, { backgroundColor: c.border }]} />}
                <View style={styles.chapterRow}>
                  <View style={styles.chapterLeft}>
                    <View style={[
                      styles.chapterDot,
                      { backgroundColor: ch.id === organization?.id ? c.primary : c.surfaceAlt },
                    ]} />
                    <View style={{ flex: 1 }}>
                      <View style={styles.chapterNameRow}>
                        <Text size="md" weight="bold" color={c.text}>{ch.name}</Text>
                        {ch.id === organization?.id && (
                          <View style={[styles.youBadge, { backgroundColor: c.primary + '22', borderColor: c.primary }]}>
                            <Text size="xs" color={c.primary} weight="medium">You</Text>
                          </View>
                        )}
                        {!ch.is_active && (
                          <View style={[styles.youBadge, { backgroundColor: c.error + '22', borderColor: c.error }]}>
                            <Text size="xs" color={c.error} weight="medium">Inactive</Text>
                          </View>
                        )}
                      </View>
                      {ch.institution && (
                        <Text size="sm" color={c.textMuted}>{ch.institution}</Text>
                      )}
                      {ch.join_code && (
                        <Text size="xs" color={c.textSubtle} style={{ marginTop: 2, letterSpacing: 1 }}>
                          Code: {ch.join_code}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* No-parent, no-children empty state */}
        {!parentOrg && chapters.length === 0 && (
          <View style={[styles.emptyCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Ionicons name="business-outline" size={36} color={c.textSubtle} />
            <Text size="md" weight="bold" color={c.text} style={{ marginTop: 12 }}>
              No chapters yet
            </Text>
            <Text size="sm" color={c.textMuted} style={{ textAlign: 'center', marginTop: 4, lineHeight: 20 }}>
              This organization has no other chapters.{'\n'}
              Create one to start expanding.
            </Text>
            {isOrgAdmin && (
              <TouchableOpacity
                onPress={() => router.push('/(auth)/create-chapter')}
                style={[styles.emptyBtn, { backgroundColor: c.primary }]}
              >
                <Text size="sm" weight="bold" style={{ color: '#fff' }}>Create a chapter</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── Small inline component to fetch + display the current chapter's join code ──
function JoinCodeInline({ orgId, color }: { orgId: string; color: string }) {
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    supabase
      .from('organizations')
      .select('join_code')
      .eq('id', orgId)
      .single()
      .then(({ data }) => setCode(data?.join_code ?? null));
  }, [orgId]);

  if (!code) return <Text style={{ color }}>—</Text>;
  return <Text style={{ color, fontSize: 20, fontWeight: '700', letterSpacing: 2 }}>{code}</Text>;
}

const styles = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  addBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },

  scroll:       { padding: 20, gap: 16, paddingBottom: 48 },
  scrollWide:   { paddingHorizontal: 48, maxWidth: 800, alignSelf: 'center', width: '100%' },

  section:      { borderRadius: 14, borderWidth: 1, padding: 20, gap: 8 },
  sectionHeader:{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  sectionLabel: { textTransform: 'uppercase', letterSpacing: 1 },

  codeRow:      { flexDirection: 'row', alignItems: 'center', gap: 12 },

  divider:      { height: 1, marginVertical: 12 },
  chapterRow:   { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  chapterLeft:  { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  chapterDot:   { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  chapterNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  youBadge:     { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },

  emptyCard:    { borderRadius: 14, borderWidth: 1, padding: 32, alignItems: 'center', gap: 4 },
  emptyBtn:     { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
});
