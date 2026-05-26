/**
 * Org Admin — Chapters Management
 *
 * Org admins can:
 *  - View all chapters under their organization
 *  - Create new chapters
 *  - Deactivate / reactivate existing chapters
 *  - See member count and join code per chapter
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View
}  from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Input, Text, useAlert } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import type { Tables } from '@/types/database';

type Chapter = Tables<'chapters'> & { memberCount?: number };

const ORG_ADMIN_BLUE = '#3B82F6';

const BRAND_COLORS = [
  '#E26B4A', '#3B82F6', '#22C55E', '#A855F7', '#CA8A04', '#1C1917',
];

function slugify(str: string) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function generateJoinCode(name: string): string {
  const base = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const rand  = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `${base}-${rand}`;
}

// ─── Create Chapter Modal ─────────────────────────────────────────────────────

function CreateChapterModal({
  visible,
  parentOrgId,
  parentOrgName,
  onClose,
  onCreated
} : {
  visible:       boolean;
  parentOrgId:   string;
  parentOrgName: string;
  onClose:       () => void;
  onCreated:     () => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const { user, profile } = useAuthStore();

  const [name, setName]           = useState('');
  const [institution, setInst]    = useState('');
  const [primaryColor, setColor]  = useState(BRAND_COLORS[1]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  function reset() { setName(''); setInst(''); setColor(BRAND_COLORS[1]); setError(''); }

  async function handleCreate() {
    if (!name.trim() || !institution.trim()) {
      setError('Chapter name and school are required.');
      return;
    }
    setLoading(true);
    setError('');

    let userId = user?.id;
    if (!userId) {
      const { data: { session } } = await supabase.auth.getSession();
      userId = session?.user?.id;
    }
    if (!userId) { setError('Not logged in.'); setLoading(false); return; }

    const joinCode = generateJoinCode(name);
    const { data: chapter, error: chErr } = await supabase
      .from('chapters')
      .insert({
        name:          name.trim(),
        slug:          slugify(name),
        org_id:        parentOrgId,
        institution:   institution.trim(),
        primary_color: primaryColor,
        timezone:      'America/New_York',
        join_code:     joinCode,
        created_by:    userId
} )
      .select()
      .single();

    if (chErr || !chapter) {
      setError(chErr?.message ?? 'Failed to create chapter.');
      setLoading(false);
      return;
    }

    setLoading(false);
    reset();
    onCreated();
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: c.surface }]}>
          <View style={[styles.handle, { backgroundColor: c.border }]} />

          <Text size="lg" weight="bold" style={{ marginBottom: 4 }}>Create chapter</Text>
          <Text size="sm" color={c.textMuted} style={{ marginBottom: 20 }}>
            Under <Text size="sm" weight="semibold" color={c.text}>{parentOrgName}</Text>
          </Text>

          <Input
            label="Chapter name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Beta Chapter"
            autoCapitalize="words"
          />
          <Input
            label="School / institution"
            value={institution}
            onChangeText={setInst}
            placeholder="University of Michigan"
            autoCapitalize="words"
          />

          {/* Color picker */}
          <Text size="xs" weight="medium" color={c.textMuted}
            style={{ textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 4 }}>
            Chapter color
          </Text>
          <View style={styles.swatches}>
            {BRAND_COLORS.map((col) => (
              <TouchableOpacity
                key={col}
                onPress={() => setColor(col)}
                style={[
                  styles.swatch,
                  { backgroundColor: col },
                  primaryColor === col && styles.swatchSelected,
                ]}
              >
                {primaryColor === col && <Ionicons name="checkmark" size={14} color="#fff" />}
              </TouchableOpacity>
            ))}
          </View>

          {error ? <Text size="sm" color={c.error} style={{ marginTop: 8 }}>{error}</Text> : null}

          <View style={styles.modalActions}>
            <Button label="Cancel" variant="outline" onPress={() => { reset(); onClose(); }} style={{ flex: 1 }} />
            <Button label="Create" onPress={handleCreate} loading={loading} style={{ flex: 1 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Chapter card ─────────────────────────────────────────────────────────────

function ChapterCard({
  chapter,
  onToggleActive
} : {
  chapter:        Chapter;
  onToggleActive: (ch: Chapter) => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  const isActive = chapter.is_active ?? true;

  return (
    <View style={[styles.chapterCard, { backgroundColor: c.surface, borderColor: c.border }]}>
      {/* Color stripe */}
      <View style={[styles.colorStripe, { backgroundColor: chapter.primary_color ?? ORG_ADMIN_BLUE }]} />

      <View style={{ flex: 1, padding: 16 }}>
        {/* Header row */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text size="md" weight="semibold">{chapter.name}</Text>
            {chapter.institution && (
              <Text size="sm" color={c.textMuted} style={{ marginTop: 2 }}>{chapter.institution}</Text>
            )}
          </View>
          <View style={[
            styles.statusPill,
            { backgroundColor: isActive ? '#22C55E22' : c.surfaceAlt, borderColor: isActive ? '#22C55E' : c.border },
          ]}>
            <Text size="xs" weight="medium" color={isActive ? '#22C55E' : c.textMuted}>
              {isActive ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>

        {/* Stats row */}
        <View style={[styles.statsRow, { borderTopColor: c.border, marginTop: 12 }]}>
          <View style={styles.stat}>
            <Ionicons name="people-outline" size={14} color={c.textMuted} />
            <Text size="xs" color={c.textMuted}>{chapter.memberCount ?? 0} members</Text>
          </View>
          {chapter.join_code && (
            <View style={styles.stat}>
              <Ionicons name="key-outline" size={14} color={c.textMuted} />
              <Text size="xs" color={c.textMuted} style={{ fontFamily: 'monospace' }}>
                {chapter.join_code}
              </Text>
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={styles.cardActions}>
          <Pressable
            onPress={() => onToggleActive(chapter)}
            style={({ pressed }) => [
              styles.cardActionBtn,
              {
                borderColor: isActive ? c.error : '#22C55E',
                opacity: pressed ? 0.7 : 1
} ,
            ]}
          >
            <Ionicons
              name={isActive ? 'pause-circle-outline' : 'play-circle-outline'}
              size={15}
              color={isActive ? c.error : '#22C55E'}
            />
            <Text size="xs" color={isActive ? c.error : '#22C55E'}>
              {isActive ? 'Deactivate' : 'Reactivate'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function OrgAdminChaptersScreen() {
  const { theme }        = useThemeStore();
  const insets           = useSafeAreaInsets();
  const { width }        = useWindowDimensions();
  const isWide           = width >= 800;
  const { organization } = useAuthStore();
  const { confirm } = useAlert();

  const [chapters, setChapters]     = useState<Chapter[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefresh]    = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const orgId = organization?.id;

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }

    const { data: chaptersData } = await supabase
      .from('chapters')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_deleted', false)
      .order('name');

    if (!chaptersData) { setLoading(false); setRefresh(false); return; }

    // Member counts
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

  async function handleToggleActive(chapter: Chapter) {
    const isActive = chapter.is_active ?? true;
    const action   = isActive ? 'deactivate' : 'reactivate';

    confirm(
      `${action.charAt(0).toUpperCase() + action.slice(1)} chapter`,
      isActive
        ? `Deactivating "${chapter.name}" will prevent members from joining and hide it from the active chapter list. Members keep their data.`
        : `Reactivating "${chapter.name}" will make it visible and joinable again.`,
      async () => {
        await supabase
          .from('chapters')
          .update({ is_active: !isActive })
          .eq('id', chapter.id);
        load();
      },
      { confirmLabel: isActive ? 'Deactivate' : 'Reactivate', destructive: isActive }
    );
  }

  const c = theme.colors;

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
          <Text size="xxl" weight="bold">Chapters</Text>
          <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>
            {chapters.length} chapter{chapters.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <Pressable
          onPress={() => setShowCreate(true)}
          style={({ pressed }) => [
            styles.createBtn,
            { backgroundColor: ORG_ADMIN_BLUE, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text size="sm" weight="semibold" style={{ color: '#fff' }}>New chapter</Text>
        </Pressable>
      </View>

      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[styles.scroll, isWide && styles.scrollWide, !isWide && { paddingBottom: insets.bottom + 24 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefresh(true); load(); }} tintColor={ORG_ADMIN_BLUE} />
        }
        showsVerticalScrollIndicator={false}
      >
        {chapters.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="business-outline" size={48} color={c.textSubtle} />
            <Text size="md" weight="medium" color={c.textMuted} style={{ marginTop: 12 }}>
              No chapters yet
            </Text>
            <Text size="sm" color={c.textSubtle} style={{ marginTop: 4, textAlign: 'center' }}>
              Create your first chapter to get started.
            </Text>
            <Pressable
              onPress={() => setShowCreate(true)}
              style={[styles.createBtn, { backgroundColor: ORG_ADMIN_BLUE, marginTop: 20 }]}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text size="sm" weight="semibold" style={{ color: '#fff' }}>Create chapter</Text>
            </Pressable>
          </View>
        ) : (
          chapters.map((ch) => (
            <ChapterCard
              key={ch.id}
              chapter={ch}
              onToggleActive={handleToggleActive}
            />
          ))
        )}
      </ScrollView>

      <CreateChapterModal
        visible={showCreate}
        parentOrgId={orgId ?? ''}
        parentOrgName={organization?.name ?? ''}
        onClose={() => setShowCreate(false)}
        onCreated={load}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  createBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },

  scroll:      { padding: 20, gap: 14, paddingBottom: 48 },
  scrollWide:  { paddingHorizontal: 48, maxWidth: 900, alignSelf: 'center', width: '100%' },

  chapterCard:  { borderRadius: 14, borderWidth: 1, overflow: 'hidden', flexDirection: 'row' },
  colorStripe:  { width: 6 },

  statsRow:     { flexDirection: 'row', gap: 16, borderTopWidth: 1, paddingTop: 10 },
  stat:         { flexDirection: 'row', alignItems: 'center', gap: 5 },

  statusPill:   { borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },

  cardActions:     { flexDirection: 'row', gap: 8, marginTop: 12 },
  cardActionBtn:   { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },

  emptyState: { alignItems: 'center', paddingVertical: 60 },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet:   { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, gap: 12 },
  handle:       { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  swatches:     { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 4 },
  swatch:       { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  swatchSelected: { borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 }
} );
