import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, useWindowDimensions, View } from 'react-native';

import { Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { su } from '../../_layout';
import type { Tables } from '@/types/database';

type Org = Tables<'organizations'>;

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: su.textMuted, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={su.textSubtle}
        style={{
          backgroundColor: su.surface, borderRadius: 10, borderWidth: 1, borderColor: su.border,
          paddingHorizontal: 14, paddingVertical: 12, color: su.text, fontSize: 14,
          // @ts-ignore
          outline: 'none',
        }}
      />
    </View>
  );
}

export default function OrgSettingsScreen() {
  const { org_id } = useLocalSearchParams<{ org_id: string }>();
  const { width } = useWindowDimensions();
  const isWide = width >= 800;

  const [org, setOrg] = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Editable fields
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [greekLetterOrg, setGreekLetterOrg] = useState('');
  const [timezone, setTimezone] = useState('');
  const [primaryColor, setPrimaryColor] = useState('');
  const [appDisplayName, setAppDisplayName] = useState('');

  useEffect(() => { loadOrg(); }, [org_id]);

  async function loadOrg() {
    setLoading(true);
    const { data } = await supabase.from('organizations').select('*').eq('id', org_id as string).single();
    if (data) {
      setOrg(data);
      setName(data.name);
      setInstitution(data.institution ?? '');
      setGreekLetterOrg(data.greek_letter_org ?? '');
      setTimezone(data.timezone);
      setPrimaryColor(data.primary_color ?? '');
      setAppDisplayName(data.app_display_name ?? '');
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!org) return;
    setSaving(true);
    await supabase.from('organizations').update({
      name: name.trim(),
      institution: institution.trim() || null,
      greek_letter_org: greekLetterOrg.trim() || null,
      timezone,
      primary_color: primaryColor.trim() || null,
      app_display_name: appDisplayName.trim() || null,
    }).eq('id', org.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) return <View style={{ flex: 1, backgroundColor: su.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={su.primary} /></View>;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: su.bg }} contentContainerStyle={{ padding: isWide ? 32 : 16, paddingBottom: 60 }}>
      <Pressable onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 }}>
        <Ionicons name="chevron-back" size={16} color={su.textMuted} />
        <Text style={{ color: su.textMuted, fontSize: 13 }}>Org detail</Text>
      </Pressable>

      <Text style={{ color: su.text, fontSize: 24, fontWeight: '700', marginBottom: 24 }}>Edit org</Text>

      <View style={{ gap: 20, maxWidth: 600 }}>
        <Field label="Chapter name"            value={name}           onChange={setName}           placeholder="e.g. Kappa Sigma — Alpha Mu" />
        <Field label="Institution"             value={institution}    onChange={setInstitution}    placeholder="e.g. UCLA" />
        <Field label="Greek letter org"        value={greekLetterOrg} onChange={setGreekLetterOrg} placeholder="e.g. Kappa Sigma" />
        <Field label="Timezone"                value={timezone}       onChange={setTimezone}       placeholder="America/New_York" />
        <Field label="Primary color (hex)"     value={primaryColor}   onChange={setPrimaryColor}   placeholder="#E26B4A" />
        <Field label="App display name"        value={appDisplayName} onChange={setAppDisplayName} placeholder="Override app name shown to members" />

        {/* Color preview */}
        {primaryColor && /^#[0-9A-Fa-f]{6}$/.test(primaryColor) && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: primaryColor }} />
            <Text style={{ color: su.textMuted, fontSize: 13 }}>Color preview</Text>
          </View>
        )}

        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={{ backgroundColor: saved ? su.success : su.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8 }}
        >
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save changes'}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
