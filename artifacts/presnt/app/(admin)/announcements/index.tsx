/**
 * Admin — Announcements
 *
 * Chapter admins can compose and send push notifications to all
 * members in their chapter. They cannot target the whole org
 * (that scope is reserved for org_admin).
 *
 * Desktop: shown in sidebar nav.
 * Mobile:  accessed from the More tab (not in the bottom bar).
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';

// ─── Types ────────────────────────────────────────────────────────────────────

type Announcement = {
  id:              string;
  title:           string;
  body:            string;
  scope:           'chapter' | 'org';
  created_at:      string;
  author_id:       string;
  recipient_count: number | null;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminAnnouncementsScreen() {
  const { theme }        = useThemeStore();
  const insets           = useSafeAreaInsets();
  const { width }        = useWindowDimensions();
  const isWide           = width >= 768;
  const { organization, membership } = useAuthStore();
  const c                = theme.colors;

  const [title,       setTitle]       = useState('');
  const [body,        setBody]        = useState('');
  const [sending,     setSending]     = useState(false);
  const [history,     setHistory]     = useState<Announcement[]>([]);
  const [loadingHist, setLoadingHist] = useState(true);

  const orgId = membership?.org_id ?? organization?.id ?? '';

  // ── Load history ────────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    if (!orgId) return;
    setLoadingHist(true);
    try {
      const { data } = await supabase
        .from('announcements')
        .select('*')
        .eq('org_id', orgId)
        .eq('scope', 'chapter')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(50);
      setHistory((data as any) ?? []);
    } catch {
      // table may not exist yet — show empty state
    } finally {
      setLoadingHist(false);
    }
  }, [orgId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // ── Send announcement ────────────────────────────────────────────────────────
  async function handleSend() {
    if (!title.trim()) {
      Alert.alert('Title required', 'Please enter a title for your announcement.');
      return;
    }
    if (!body.trim()) {
      Alert.alert('Message required', 'Please enter a message body.');
      return;
    }

    Alert.alert(
      'Send Announcement',
      `Send "${title.trim()}" to all chapter members?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          style: 'default',
          onPress: async () => {
            setSending(true);
            try {
              const now = new Date().toISOString();
              const { error } = await supabase.from('announcements').insert({
                org_id:       orgId,
                scope:        'chapter',
                title:        title.trim(),
                body:         body.trim(),
                author_id:    membership!.user_id,
                created_by:   membership!.user_id,
                send_push:    true,
                audience:     'all',
                published_at: now,
              });
              if (error) throw error;
              Alert.alert('Sent!', 'Your announcement has been delivered.');
              setTitle('');
              setBody('');
              loadHistory();
            } catch (err: any) {
              Alert.alert('Error', err?.message ?? 'Failed to send announcement.');
            } finally {
              setSending(false);
            }
          },
        },
      ]
    );
  }

  // ── Render history item ──────────────────────────────────────────────────────
  function renderItem({ item }: { item: Announcement }) {
    const date = new Date(item.created_at);
    const label = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const time  = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return (
      <View style={[styles.histRow, { borderBottomColor: c.border }]}>
        <View style={[styles.histIcon, { backgroundColor: c.primary + '18' }]}>
          <Ionicons name="megaphone-outline" size={16} color={c.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" weight="medium" numberOfLines={1}>{item.title}</Text>
          <Text size="xs" color={c.textMuted} numberOfLines={2} style={{ marginTop: 2 }}>{item.body}</Text>
          <Text size="xs" color={c.textSubtle} style={{ marginTop: 4 }}>
            {label} · {time}
            {item.recipient_count != null ? ` · ${item.recipient_count} recipients` : ''}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[
        styles.header,
        { paddingTop: isWide ? 20 : insets.top + 12, backgroundColor: c.surface, borderBottomColor: c.border },
      ]}>
        <View>
          <Text size="xxl" weight="bold">Announcements</Text>
          {organization && (
            <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>
              Chapter · {organization.name}
            </Text>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, isWide && styles.scrollWide, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Compose card ──────────────────────────────────────────────── */}
        <Card>
          <View style={[styles.composeHeader, { borderBottomColor: c.border }]}>
            <Ionicons name="megaphone-outline" size={18} color={c.primary} />
            <Text size="md" weight="bold" style={{ marginLeft: 8 }}>New Announcement</Text>
          </View>

          {/* Scope badge — chapter admin is always chapter-scoped */}
          <View style={[styles.scopeRow, { backgroundColor: c.primary + '18', borderRadius: 8 }]}>
            <Ionicons name="people-outline" size={14} color={c.primary} />
            <Text size="xs" color={c.primary} weight="medium" style={{ marginLeft: 6 }}>
              Sending to: Chapter Members
            </Text>
          </View>

          <Text size="xs" color={c.textMuted} style={styles.fieldLabel}>TITLE</Text>
          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.surfaceAlt }]}
            placeholderTextColor={c.textSubtle}
            placeholder="e.g. Important Chapter Update"
            value={title}
            onChangeText={setTitle}
            maxLength={100}
            returnKeyType="next"
          />

          <Text size="xs" color={c.textMuted} style={styles.fieldLabel}>MESSAGE</Text>
          <TextInput
            style={[styles.input, styles.textArea, { color: c.text, borderColor: c.border, backgroundColor: c.surfaceAlt }]}
            placeholderTextColor={c.textSubtle}
            placeholder="Write your announcement here…"
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={500}
            textAlignVertical="top"
          />
          <Text size="xs" color={c.textSubtle} style={{ textAlign: 'right', marginBottom: 16 }}>
            {body.length}/500
          </Text>

          <Pressable
            onPress={handleSend}
            disabled={sending || !title.trim() || !body.trim()}
            style={({ pressed }) => [
              styles.sendBtn,
              { backgroundColor: c.primary, opacity: (pressed || sending || !title.trim() || !body.trim()) ? 0.6 : 1 },
            ]}
          >
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="send-outline" size={16} color="#fff" />
            }
            <Text size="sm" weight="bold" color="#fff" style={{ marginLeft: 8 }}>
              {sending ? 'Sending…' : 'Send to Chapter'}
            </Text>
          </Pressable>
        </Card>

        {/* ── History ───────────────────────────────────────────────────── */}
        <Text size="xs" weight="medium" color={c.textMuted}
          style={{ marginTop: 24, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Recent Announcements
        </Text>

        <Card style={{ paddingVertical: 0 }}>
          {loadingHist ? (
            <View style={styles.empty}>
              <ActivityIndicator color={c.primary} />
            </View>
          ) : history.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="megaphone-outline" size={36} color={c.textSubtle} />
              <Text size="sm" color={c.textMuted} style={{ marginTop: 12, textAlign: 'center' }}>
                No announcements sent yet.
              </Text>
            </View>
          ) : (
            history.map((item, i) => (
              <View key={item.id} style={i < history.length - 1 ? undefined : { borderBottomWidth: 0 }}>
                {renderItem({ item })}
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom:     14,
    borderBottomWidth: 1,
  },
  scroll: {
    padding: 20,
  },
  scrollWide: {
    paddingHorizontal: 48,
    maxWidth:          760,
    alignSelf:         'center',
    width:             '100%',
  },
  composeHeader: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingBottom:    14,
    marginBottom:     14,
    borderBottomWidth: 1,
  },
  scopeRow: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingHorizontal: 12,
    paddingVertical:   8,
    marginBottom:   16,
  },
  fieldLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom:  6,
  },
  input: {
    borderWidth:   1,
    borderRadius:  10,
    paddingHorizontal: 14,
    paddingVertical:   11,
    fontSize:      15,
    marginBottom:  14,
  },
  textArea: {
    height:        120,
    marginBottom:  4,
  },
  sendBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius:   12,
  },
  histRow: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    gap:            12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  histIcon: {
    width:          36,
    height:         36,
    borderRadius:   9,
    alignItems:     'center',
    justifyContent: 'center',
    marginTop:      2,
  },
  empty: {
    alignItems:    'center',
    paddingVertical: 40,
  },
});
