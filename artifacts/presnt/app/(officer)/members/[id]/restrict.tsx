/**
 * Officer — Apply Restriction  /(officer)/members/:id/restrict
 *
 * Form to apply a new restriction or view existing ones.
 * Restriction types: dues_hold · manual_block · suspension · probation · inactive
 *
 * Fields:
 *   - Type (segmented picker)
 *   - Reason (required, visible to member)
 *   - Internal Note (officer-only)
 *   - Blocks toggles (auto-set by type, overrideable)
 *   - Ends At (optional)
 *   - Auto-lift condition
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { usePermissions } from '@/hooks/usePermissions';
import { PERMISSIONS } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useUserViewStore } from '@/stores/userViewStore';

const DESKTOP = 768;

// ─── Types ────────────────────────────────────────────────────────────────────

type RestrictionType = 'dues_hold' | 'manual_block' | 'suspension' | 'probation' | 'inactive';
type AutoLiftCondition = 'dues_paid' | 'officer_approval' | 'term_end' | '';

type Defaults = {
  blocksEventAttendance: boolean;
  blocksEventRsvp:       boolean;
  blocksCalendarView:    boolean;
  blocksExcuseSubmission:boolean;
  blocksVoting:          boolean;
  defaultAutoLift:       AutoLiftCondition;
};

const TYPE_DEFAULTS: Record<RestrictionType, Defaults> = {
  dues_hold: {
    blocksEventAttendance:  true,
    blocksEventRsvp:        true,
    blocksCalendarView:     false,
    blocksExcuseSubmission: false,
    blocksVoting:           false,
    defaultAutoLift:        'dues_paid',
  },
  manual_block: {
    blocksEventAttendance:  true,
    blocksEventRsvp:        true,
    blocksCalendarView:     false,
    blocksExcuseSubmission: true,
    blocksVoting:           true,
    defaultAutoLift:        'officer_approval',
  },
  suspension: {
    blocksEventAttendance:  true,
    blocksEventRsvp:        true,
    blocksCalendarView:     false,
    blocksExcuseSubmission: true,
    blocksVoting:           true,
    defaultAutoLift:        'officer_approval',
  },
  probation: {
    blocksEventAttendance:  false,
    blocksEventRsvp:        false,
    blocksCalendarView:     false,
    blocksExcuseSubmission: false,
    blocksVoting:           false,
    defaultAutoLift:        'term_end',
  },
  inactive: {
    blocksEventAttendance:  true,
    blocksEventRsvp:        true,
    blocksCalendarView:     false,
    blocksExcuseSubmission: true,
    blocksVoting:           true,
    defaultAutoLift:        '',
  },
};

const TYPE_LABELS: Record<RestrictionType, string> = {
  dues_hold:    'Dues Hold',
  manual_block: 'Manual Block',
  suspension:   'Suspension',
  probation:    'Probation',
  inactive:     'Inactive',
};

const AUTO_LIFT_LABELS: Record<string, string> = {
  dues_paid:        'When dues are paid',
  officer_approval: 'Officer must lift manually',
  term_end:         'End of term',
  '':               'None (manual)',
};

// ─── Toggle Row ───────────────────────────────────────────────────────────────

function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label:       string;
  description: string;
  value:       boolean;
  onChange:    (v: boolean) => void;
}) {
  const { theme } = useThemeStore();
  const c = theme.colors;
  return (
    <View style={[tr.row, { borderBottomColor: c.border }]}>
      <View style={{ flex: 1 }}>
        <Text size="sm" weight="medium">{label}</Text>
        <Text size="xs" color={c.textMuted}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: c.border, true: c.primary + '80' }}
        thumbColor={value ? c.primary : c.textSubtle}
      />
    </View>
  );
}

const tr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, gap: 12 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ApplyRestrictionScreen() {
  const { id: membershipId }       = useLocalSearchParams<{ id: string }>();
  const { theme }                  = useThemeStore();
  const insets                     = useSafeAreaInsets();
  const { width }                  = useWindowDimensions();
  const isWide                     = width >= DESKTOP;
  const { profile }  = useAuthStore();
  const userView                   = useUserViewStore((s) => s.session);
  const { can }                    = usePermissions();
  const c                          = theme.colors;

  const orgId     = userView?.org.id ?? membership?.org_id ?? '';
  const viewPerms = userView?.role === 'officer' ? userView.permissions : null;
  const canManage = viewPerms ? viewPerms.includes(PERMISSIONS.MANAGE_MEMBERS) : can(PERMISSIONS.MANAGE_MEMBERS as any);

  // ── Member name for header ──
  const [memberName, setMemberName] = useState('');
  useEffect(() => {
    if (!membershipId) return;
    supabase
      .from('memberships')
      .select('profiles!user_id(first_name, last_name)')
      .eq('id', membershipId)
      .single()
      .then(({ data }) => {
        if (data?.profiles) {
          const p = data.profiles as { first_name: string; last_name: string };
          setMemberName(`${p.first_name} ${p.last_name}`);
        }
      });
  }, [membershipId]);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [type,      setType]      = useState<RestrictionType>('manual_block');
  const [reason,    setReason]    = useState('');
  const [note,      setNote]      = useState('');
  const [endsAt,    setEndsAt]    = useState('');
  const [autoLift,  setAutoLift]  = useState<AutoLiftCondition>('officer_approval');
  const [blocks,    setBlocks]    = useState({ ...TYPE_DEFAULTS['manual_block'] });
  const [saving,    setSaving]    = useState(false);

  // When type changes, reset defaults
  function selectType(t: RestrictionType) {
    setType(t);
    const d = TYPE_DEFAULTS[t];
    setBlocks({ ...d });
    setAutoLift(d.defaultAutoLift);
  }

  async function handleSave() {
    if (!reason.trim()) {
      Alert.alert('Reason required', 'Please enter a reason visible to the member.');
      return;
    }
    if (!canManage) {
      Alert.alert('Insufficient permissions');
      return;
    }

    setSaving(true);

    const payload: Record<string, any> = {
      membership_id:           membershipId,
      org_id:                  orgId,
      restriction_type:        type,
      reason:                  reason.trim(),
      internal_note:           note.trim() || null,
      created_by:              profile?.id,
      blocks_event_attendance: blocks.blocksEventAttendance,
      blocks_event_rsvp:       blocks.blocksEventRsvp,
      blocks_calendar_view:    blocks.blocksCalendarView,
      blocks_excuse_submission:blocks.blocksExcuseSubmission,
      blocks_voting:           blocks.blocksVoting,
      auto_lift_condition:     autoLift || null,
      ends_at:                 endsAt ? new Date(endsAt).toISOString() : null,
      is_active:               true,
    };

    const { error } = await supabase.from('member_restrictions').insert(payload);

    if (error) {
      setSaving(false);
      Alert.alert('Error', error.message);
      return;
    }

    // Sync membership flags
    const updates: Record<string, any> = {};
    if (blocks.blocksEventAttendance) updates.can_attend_events  = false;
    if (blocks.blocksEventRsvp)       updates.can_rsvp_events    = false;
    if (blocks.blocksExcuseSubmission)updates.can_submit_excuses = false;
    if (type === 'dues_hold') {
      updates.dues_hold       = true;
      updates.dues_hold_since = new Date().toISOString();
      updates.dues_status     = 'overdue';
    }
    if (Object.keys(updates).length > 0) {
      await supabase.from('memberships').update(updates).eq('id', membershipId);
    }

    setSaving(false);
    Alert.alert('Restriction applied', `${TYPE_LABELS[type]} has been applied to ${memberName || 'this member'}.`, [
      { text: 'OK', onPress: () => router.back() },
    ]);
  }

  const form = (
    <ScrollView
      contentContainerStyle={[xs.scroll, { paddingBottom: insets.bottom + 40 }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Type selector ────────────────────────────────────────── */}
      <Text size="xs" weight="semibold" color={c.textSubtle} style={xs.sectionLabel}>RESTRICTION TYPE</Text>
      <View style={xs.typeGrid}>
        {(Object.keys(TYPE_LABELS) as RestrictionType[]).map((t) => (
          <Pressable
            key={t}
            onPress={() => selectType(t)}
            style={[xs.typeChip, {
              backgroundColor: type === t ? c.primary : c.surfaceAlt,
              borderColor:     type === t ? c.primary : c.border,
            }]}
          >
            <Text size="sm" weight={type === t ? 'semibold' : 'regular'}
              style={{ color: type === t ? '#fff' : c.text }}>
              {TYPE_LABELS[t]}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── Reason ───────────────────────────────────────────────── */}
      <Text size="xs" weight="semibold" color={c.textSubtle} style={xs.sectionLabel}>REASON (VISIBLE TO MEMBER) *</Text>
      <TextInput
        value={reason}
        onChangeText={setReason}
        placeholder="e.g. Outstanding dues balance, Conduct violation…"
        placeholderTextColor={c.textSubtle}
        multiline
        numberOfLines={3}
        style={[xs.input, { color: c.text, backgroundColor: c.surfaceAlt, borderColor: c.border, minHeight: 80 }]}
      />

      {/* ── Internal Note ─────────────────────────────────────────── */}
      <Text size="xs" weight="semibold" color={c.textSubtle} style={xs.sectionLabel}>INTERNAL NOTE (OFFICERS ONLY)</Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Optional context for officers…"
        placeholderTextColor={c.textSubtle}
        multiline
        numberOfLines={2}
        style={[xs.input, { color: c.text, backgroundColor: c.surfaceAlt, borderColor: c.border }]}
      />

      {/* ── Blocks ───────────────────────────────────────────────── */}
      <Text size="xs" weight="semibold" color={c.textSubtle} style={xs.sectionLabel}>BLOCKS</Text>
      <View style={[xs.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <ToggleRow
          label="Event Attendance"
          description="Member cannot be marked present at events"
          value={blocks.blocksEventAttendance}
          onChange={(v) => setBlocks(b => ({ ...b, blocksEventAttendance: v }))}
        />
        <ToggleRow
          label="Event RSVP"
          description="Member cannot RSVP to future events"
          value={blocks.blocksEventRsvp}
          onChange={(v) => setBlocks(b => ({ ...b, blocksEventRsvp: v }))}
        />
        <ToggleRow
          label="Excuse Submission"
          description="Member cannot submit excuses"
          value={blocks.blocksExcuseSubmission}
          onChange={(v) => setBlocks(b => ({ ...b, blocksExcuseSubmission: v }))}
        />
        <ToggleRow
          label="Voting"
          description="Member cannot participate in votes"
          value={blocks.blocksVoting}
          onChange={(v) => setBlocks(b => ({ ...b, blocksVoting: v }))}
        />
        <ToggleRow
          label="Calendar View"
          description="Member cannot see the org calendar"
          value={blocks.blocksCalendarView}
          onChange={(v) => setBlocks(b => ({ ...b, blocksCalendarView: v }))}
        />
      </View>

      {/* ── Auto-lift condition ────────────────────────────────────── */}
      <Text size="xs" weight="semibold" color={c.textSubtle} style={xs.sectionLabel}>AUTO-LIFT CONDITION</Text>
      <View style={[xs.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        {(['dues_paid', 'officer_approval', 'term_end', ''] as AutoLiftCondition[]).map((opt) => (
          <Pressable
            key={opt}
            onPress={() => setAutoLift(opt)}
            style={[xs.radioRow, { borderBottomColor: c.border }]}
          >
            <View style={[xs.radio, { borderColor: autoLift === opt ? c.primary : c.border,
              backgroundColor: autoLift === opt ? c.primary : 'transparent' }]}
            />
            <Text size="sm" color={c.text}>{AUTO_LIFT_LABELS[opt]}</Text>
          </Pressable>
        ))}
      </View>

      {/* ── Ends At ──────────────────────────────────────────────── */}
      <Text size="xs" weight="semibold" color={c.textSubtle} style={xs.sectionLabel}>ENDS AT (OPTIONAL)</Text>
      <TextInput
        value={endsAt}
        onChangeText={setEndsAt}
        placeholder="YYYY-MM-DD  (leave blank for indefinite)"
        placeholderTextColor={c.textSubtle}
        style={[xs.input, { color: c.text, backgroundColor: c.surfaceAlt, borderColor: c.border }]}
      />

      {/* ── Save ──────────────────────────────────────────────────── */}
      <Pressable
        onPress={handleSave}
        disabled={saving}
        style={[xs.saveBtn, { backgroundColor: '#EF4444', opacity: saving ? 0.6 : 1 }]}
      >
        {saving
          ? <ActivityIndicator color="#fff" />
          : <>
              <Ionicons name="ban-outline" size={16} color="#fff" />
              <Text size="md" weight="semibold" style={{ color: '#fff' }}>Apply Restriction</Text>
            </>
        }
      </Pressable>
    </ScrollView>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View style={[xs.header, {
        paddingTop: isWide ? 20 : insets.top + 12,
        backgroundColor: c.background,
        borderBottomColor: c.border,
      }]}>
        <Pressable onPress={() => router.back()} style={xs.backBtn}>
          <Ionicons name="arrow-back-outline" size={20} color={c.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text size="xl" weight="bold">Apply Restriction</Text>
          {memberName ? <Text size="xs" color={c.textMuted}>{memberName}</Text> : null}
        </View>
      </View>

      {isWide ? (
        <View style={{ flex: 1, maxWidth: 720, alignSelf: 'center', width: '100%', paddingHorizontal: 24 }}>
          {form}
        </View>
      ) : form}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const xs = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn:     { padding: 4 },
  scroll:      { padding: 20, gap: 0 },
  sectionLabel:{ textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 20 },
  typeGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip:    { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  input:       { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, textAlignVertical: 'top', fontSize: 14 },
  card:        { borderWidth: 1, borderRadius: 12, overflow: 'hidden', paddingHorizontal: 14 },
  radioRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1 },
  radio:       { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  saveBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 16, marginTop: 28 },
});
