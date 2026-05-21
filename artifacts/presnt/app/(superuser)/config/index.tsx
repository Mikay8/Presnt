import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, useWindowDimensions, View } from 'react-native';

import { Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { su } from '../_layout';

interface ConfigRow {
  key: string;
  value: string;
  description: string | null;
}

const LABELS: Record<string, string> = {
  max_geofence_radius_m:       'Max geofence radius (m)',
  qr_rotation_interval_min:    'QR rotation interval (min)',
  checkin_grace_period_min:    'Check-in grace period (min)',
  excuse_submission_window_d:  'Excuse submission window (days)',
  max_logo_size_kb:            'Max org logo size (KB)',
  free_plan_member_cap:        'Free plan member cap',
  superuser_session_timeout_m: 'Superuser session timeout (min)',
};

export default function SuperuserConfigScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 800;

  const [config, setConfig] = useState<ConfigRow[]>([]);
  const [edits, setEdits]   = useState<Record<string, string>>({});
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  useEffect(() => { loadConfig(); }, []);

  async function loadConfig() {
    setLoading(true);
    const { data } = await supabase.from('platform_config').select('*').order('key');
    const rows = (data as ConfigRow[]) ?? [];
    setConfig(rows);
    const initial: Record<string, string> = {};
    rows.forEach((r) => { initial[r.key] = r.value; });
    setEdits(initial);
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);
    const updates = Object.entries(edits).map(([key, value]) =>
      supabase.from('platform_config').update({ value, updated_at: new Date().toISOString() }).eq('key', key)
    );
    await Promise.all(updates);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const hasChanges = config.some((r) => edits[r.key] !== r.value);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: su.bg }} contentContainerStyle={{ padding: isWide ? 32 : 16, paddingBottom: 60 }}>
      <Text style={{ color: su.text, fontSize: 28, fontWeight: '700', marginBottom: 6 }}>App config</Text>
      <Text style={{ color: su.textMuted, fontSize: 13, marginBottom: 28 }}>Platform-level settings — affects all orgs</Text>

      {loading ? (
        <ActivityIndicator color={su.primary} />
      ) : (
        <View style={{ gap: 16, maxWidth: 600 }}>
          {config.map((row) => (
            <View key={row.key} style={{ gap: 6 }}>
              <Text style={{ color: su.textMuted, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                {LABELS[row.key] ?? row.key}
              </Text>
              {row.description && (
                <Text style={{ color: su.textSubtle, fontSize: 11, marginBottom: 2 }}>{row.description}</Text>
              )}
              <TextInput
                value={edits[row.key] ?? row.value}
                onChangeText={(v) => setEdits((prev) => ({ ...prev, [row.key]: v }))}
                keyboardType="numeric"
                placeholderTextColor={su.textSubtle}
                style={{
                  backgroundColor: su.surface, borderRadius: 10,
                  borderWidth: 1, borderColor: edits[row.key] !== row.value ? su.warning : su.border,
                  paddingHorizontal: 14, paddingVertical: 12, color: su.text, fontSize: 14,
                  // @ts-ignore
                  outline: 'none',
                }}
              />
            </View>
          ))}

          <Pressable
            onPress={handleSave}
            disabled={saving || !hasChanges}
            style={{
              backgroundColor: saved ? su.success : hasChanges ? su.primary : su.border,
              borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 12,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>
              {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save changes'}
            </Text>
          </Pressable>

          {!hasChanges && !saved && (
            <Text style={{ color: su.textSubtle, fontSize: 12, textAlign: 'center' }}>No unsaved changes</Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}
