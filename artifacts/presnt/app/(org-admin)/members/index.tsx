/**
 * Org Admin — Members Management
 *
 * Org admins can:
 *  - View all members across all chapters in their organization
 *  - Filter by chapter
 *  - Move a member from one chapter to another
 *  - See each member's current chapter, role, and status
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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

type Chapter = Pick<Tables<'organizations'>, 'id' | 'name' | 'institution' | 'primary_color'>;

type MemberRow = {
  id:         string;
  role:       string;
  status:     string;
  org_id:     string;
  joined_at:  string | null;
  profiles: {
    id:         string;
    first_name: string;
    last_name:  string;
    email:      string;
  } | null;
  organizations: {
    id:   string;
    name: string;
  } | null;
};

const ORG_ADMIN_BLUE = '#3B82F6';

const ROLE_COLOR: Record<string, string> = {
  admin:      '#E26B4A',
  officer:    '#A855F7',
  member:     '#3B82F6',
  new_member: '#6B7280',
};

// ─── Move Chapter Modal ───────────────────────────────────────────────────────

function MoveChapterModal({
  visible,
  member,
  chapters,
  currentChapterId,
  onClose,
  onMove,
  moving,
}: {
  visible:          boolean;
  member:           MemberRow | null;
  chapters:         Chapter[];
  currentChapterId: string;
  onClose:          () => void;
  onMove:           (memberId: string, toChapterId: string) => void;
  moving:           boolean;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;

  const [selectedChapter, setSelectedChapter] = useState<string>(currentChapterId);

  useEffect(() => {
    if (member) setSelectedChapter(member.org_id);
  }, [member]);

  if (!member) return null;

  const profile   = member.profiles;
  const firstName = profile?.first_name ?? '';
  const lastName  = profile?.last_name  ?? '';
  const initials  = firstName && lastName ? `${firstName[0]}${lastName[0]}` : '?';
  const fullName  = `${firstName} ${lastName}`.trim() || 'Unknown';

  const otherChapters = chapters.filter((ch) => ch.id !== currentChapterId);

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: c.surface }]}>
          <View style={[styles.handle, { backgroundColor: c.border }]} />

          {/* Member header */}
          <View style={styles.memberHeader}>
            <View style={[styles.avatarLg, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
              <Text size="md" weight="bold" color={c.textMuted}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text size="lg" weight="bold">{fullName}</Text>
              <Text size="sm" color={c.textMuted}>{profile?.email}</Text>
              <Text size="xs" color={c.textSubtle} style={{ marginTop: 3 }}>
                Currently in: <Text size="xs" weight="medium" color={c.text}>{member.organizations?.name ?? '—'}</Text>
              </Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: c.border }]} />

          <Text size="xs" weight="medium" color={c.textMuted}
            style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
            Move to chapter
          </Text>

          <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
            <View style={[styles.chapterList, { borderColor: c.border }]}>
              {otherChapters.length === 0 ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text size="sm" color={c.textMuted}>No other chapters available.</Text>
                  <Text size="xs" color={c.textSubtle} style={{ marginTop: 4, textAlign: 'center' }}>
                    Create another chapter first.
                  </Text>
                </View>
              ) : (
                otherChapters.map((ch, i) => {
                  const selected = selectedChapter === ch.id;
                  return (
                    <Pressable
                      key={ch.id}
                      onPress={() => setSelectedChapter(ch.id)}
                      style={[
                        styles.chapterOption,
                        i < otherChapters.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border },
                        selected && { backgroundColor: ORG_ADMIN_BLUE + '12' },
                      ]}
                    >
                      <View style={[styles.chapterDot, { backgroundColor: ch.primary_color ?? ORG_ADMIN_BLUE }]} />
                      <View style={{ flex: 1 }}>
                        <Text size="sm" weight={selected ? 'medium' : 'regular'}
                          color={selected ? ORG_ADMIN_BLUE : c.text}>
                          {ch.name}
                        </Text>
                        {ch.institution && (
                          <Text size="xs" color={c.textSubtle}>{ch.institution}</Text>
                        )}
                      </View>
                      <View style={[styles.radioOuter, { borderColor: selected ? ORG_ADMIN_BLUE : c.border }]}>
                        {selected && <View style={[styles.radioInner, { backgroundColor: ORG_ADMIN_BLUE }]} />}
                      </View>
                    </Pressable>
                  );
                })
              )}
            </View>
          </ScrollView>

          {/* Actions */}
          <View style={[styles.modalActions, { marginTop: 20 }]}>
            <Pressable
              onPress={onClose}
              style={[styles.cancelBtn, { borderColor: c.border }]}
            >
              <Text size="sm" weight="medium">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (selectedChapter && selectedChapter !== currentChapterId) {
                  onMove(member.id, selectedChapter);
                }
              }}
              disabled={!selectedChapter || selectedChapter === currentChapterId || otherChapters.length === 0}
              style={[
                styles.moveBtn,
                {
                  backgroundColor: (!selectedChapter || selectedChapter === currentChapterId || otherChapters.length === 0)
                    ? c.surfaceAlt
                    : ORG_ADMIN_BLUE,
                },
              ]}
            >
              {moving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text size="sm" weight="bold" style={{ color: '#fff' }}>Move member</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Member row ───────────────────────────────────────────────────────────────

function MemberItem({
  member,
  onMove,
}: {
  member:  MemberRow;
  onMove:  (m: MemberRow) => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;

  const profile    = member.profiles;
  const firstName  = profile?.first_name ?? '';
  const lastName   = profile?.last_name  ?? '';
  const initials   = firstName && lastName ? `${firstName[0]}${lastName[0]}` : '?';
  const fullName   = `${firstName} ${lastName}`.trim() || 'Unknown';
  const badgeColor = ROLE_COLOR[member.role] ?? '#6B7280';

  const roleLabel  = member.role.charAt(0).toUpperCase() + member.role.slice(1).replace('_', ' ');

  return (
    <Pressable
      onPress={() => onMove(member)}
      style={({ pressed }) => [
        styles.memberRow,
        { borderBottomColor: c.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
        <Text size="xs" weight="medium" color={c.textMuted}>{initials}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text size="sm" weight="medium">{fullName}</Text>
        <Text size="xs" color={c.textMuted}>{profile?.email ?? '—'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
          <Ionicons name="business-outline" size={11} color={c.textSubtle} />
          <Text size="xs" color={c.textSubtle}>{member.organizations?.name ?? '—'}</Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <View style={[styles.rolePill, { backgroundColor: badgeColor + '18', borderColor: badgeColor }]}>
          <Text size="xs" weight="medium" color={badgeColor}>{roleLabel}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="swap-horizontal-outline" size={13} color={ORG_ADMIN_BLUE} />
          <Text size="xs" color={ORG_ADMIN_BLUE}>Move</Text>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function OrgAdminMembersScreen() {
  const { theme }        = useThemeStore();
  const insets           = useSafeAreaInsets();
  const { width }        = useWindowDimensions();
  const isWide           = width >= 800;
  const { organization } = useAuthStore();

  const [chapters, setChapters]     = useState<Chapter[]>([]);
  const [members, setMembers]       = useState<MemberRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefresh]    = useState(false);
  const [chapterFilter, setFilter]  = useState<string>('all');
  const [moving, setMoving]         = useState<MemberRow | null>(null);
  const [saving, setSaving]         = useState(false);

  const orgId = organization?.id;

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }

    // Fetch chapters
    const { data: chaptersData } = await supabase
      .from('organizations')
      .select('id, name, institution, primary_color')
      .eq('parent_org_id', orgId)
      .eq('is_deleted', false)
      .order('name');

    setChapters((chaptersData as Chapter[]) ?? []);

    if (!chaptersData || chaptersData.length === 0) {
      setLoading(false);
      setRefresh(false);
      return;
    }

    // Fetch all members across all chapters
    const { data: membersData } = await supabase
      .from('memberships')
      .select(`
        id, role, status, org_id, joined_at,
        profiles!user_id(id, first_name, last_name, email),
        organizations!org_id(id, name)
      `)
      .in('org_id', chaptersData.map((c) => c.id))
      .eq('is_deleted', false)
      .order('role');

    setMembers((membersData as MemberRow[]) ?? []);
    setLoading(false);
    setRefresh(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  async function handleMove(memberId: string, toChapterId: string) {
    setSaving(true);
    const { error } = await supabase
      .from('memberships')
      .update({ org_id: toChapterId })
      .eq('id', memberId);

    if (error) {
      Alert.alert('Error', error.message);
    }
    await load();
    setSaving(false);
    setMoving(null);
  }

  const c = theme.colors;

  // Apply chapter filter
  const filtered = chapterFilter === 'all'
    ? members
    : members.filter((m) => m.org_id === chapterFilter);

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
          <Text size="xxl" weight="bold">Members</Text>
          <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>
            {filtered.length} member{filtered.length !== 1 ? 's' : ''} across {chapters.length} chapter{chapters.length !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      {/* Chapter filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={{ height: 50, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border }}
      >
        {/* All */}
        <Pressable
          onPress={() => setFilter('all')}
          style={[
            styles.filterChip,
            { borderColor: chapterFilter === 'all' ? ORG_ADMIN_BLUE : c.border,
              backgroundColor: chapterFilter === 'all' ? ORG_ADMIN_BLUE + '14' : 'transparent' },
          ]}
        >
          <Text size="xs" weight={chapterFilter === 'all' ? 'medium' : 'regular'}
            color={chapterFilter === 'all' ? ORG_ADMIN_BLUE : c.textMuted}>
            All chapters
          </Text>
        </Pressable>

        {chapters.map((ch) => {
          const active = chapterFilter === ch.id;
          return (
            <Pressable
              key={ch.id}
              onPress={() => setFilter(ch.id)}
              style={[
                styles.filterChip,
                { borderColor: active ? ORG_ADMIN_BLUE : c.border,
                  backgroundColor: active ? ORG_ADMIN_BLUE + '14' : 'transparent' },
              ]}
            >
              <View style={[styles.filterDot, { backgroundColor: ch.primary_color ?? ORG_ADMIN_BLUE }]} />
              <Text size="xs" weight={active ? 'medium' : 'regular'}
                color={active ? ORG_ADMIN_BLUE : c.textMuted}>
                {ch.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.scroll, isWide && styles.scrollWide, !isWide && { paddingBottom: insets.bottom + 24 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefresh(true); load(); }} tintColor={ORG_ADMIN_BLUE} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Info banner */}
        <View style={[styles.infoBanner, { backgroundColor: ORG_ADMIN_BLUE + '12', borderColor: ORG_ADMIN_BLUE + '40' }]}>
          <Ionicons name="information-circle-outline" size={16} color={ORG_ADMIN_BLUE} />
          <Text size="xs" color={ORG_ADMIN_BLUE}>
            Tap a member to move them to a different chapter. Their role within the new chapter will be set to Member.
          </Text>
        </View>

        {chapters.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="business-outline" size={40} color={c.textSubtle} />
            <Text size="md" weight="medium" color={c.textMuted} style={{ marginTop: 12 }}>
              No chapters yet
            </Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={40} color={c.textSubtle} />
            <Text size="md" weight="medium" color={c.textMuted} style={{ marginTop: 12 }}>
              No members in this chapter
            </Text>
          </View>
        ) : (
          <Card style={{ paddingVertical: 0 }}>
            {filtered.map((m, i) => (
              <View
                key={m.id}
                style={i < filtered.length - 1 ? { borderBottomWidth: 1, borderBottomColor: c.border } : undefined}
              >
                <MemberItem member={m} onMove={setMoving} />
              </View>
            ))}
          </Card>
        )}
      </ScrollView>

      <MoveChapterModal
        visible={!!moving}
        member={moving}
        chapters={chapters}
        currentChapterId={moving?.org_id ?? ''}
        onClose={() => setMoving(null)}
        onMove={handleMove}
        moving={saving}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },

  filterRow:  { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8, alignItems: 'center' },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  filterDot:  { width: 8, height: 8, borderRadius: 4 },

  scroll:     { padding: 20, paddingBottom: 48, gap: 14 },
  scrollWide: { paddingHorizontal: 48, maxWidth: 760, alignSelf: 'center', width: '100%' },

  infoBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1 },

  memberRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1 },
  avatar:     { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  rolePill:   { borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet:   { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, maxHeight: '85%' },
  handle:       { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },

  memberHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 20 },
  avatarLg:     { width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  divider:      { height: 1, marginBottom: 20 },

  chapterList:    { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  chapterOption:  { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  chapterDot:     { width: 12, height: 12, borderRadius: 6 },

  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 10, height: 10, borderRadius: 5 },

  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn:    { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  moveBtn:      { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
});
