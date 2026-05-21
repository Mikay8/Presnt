import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, useWindowDimensions, View } from 'react-native';

import { Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { su } from '../../_layout';
import type { Tables } from '@/types/database';

type Profile = Tables<'profiles'>;

function Field({ label, value, onChange, placeholder, note }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; note?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: su.textMuted, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={su.textSubtle}
        style={{ backgroundColor: su.surface, borderRadius: 10, borderWidth: 1, borderColor: su.border, paddingHorizontal: 14, paddingVertical: 12, color: su.text, fontSize: 14, // @ts-ignore
          outline: 'none' }}
      />
      {note && <Text style={{ color: su.warning, fontSize: 11 }}>⚠ {note}</Text>}
    </View>
  );
}

export default function UserEditorScreen() {
  const { profile_id } = useLocalSearchParams<{ profile_id: string }>();
  const { width } = useWindowDimensions();
  const isWide = width >= 800;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [email, setEmail]         = useState('');
  const [phone, setPhone]         = useState('');
  const [major, setMajor]         = useState('');

  useEffect(() => { loadProfile(); }, [profile_id]);

  async function loadProfile() {
    setLoading(true);
    const { data } = await supabase.from('profiles').select('*').eq('id', profile_id as string).single();
    if (data) {
      setProfile(data);
      setFirstName(data.first_name);
      setLastName(data.last_name);
      setEmail(data.email);
      setPhone(data.phone ?? '');
      setMajor(data.major ?? '');
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!profile) return;
    setSaving(true);
    await supabase.from('profiles').update({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      phone: phone.trim() || null,
      major: major.trim() || null,
    }).eq('id', profile.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) return <View style={{ flex: 1, backgroundColor: su.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={su.primary} /></View>;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: su.bg }} contentContainerStyle={{ padding: isWide ? 32 : 16, paddingBottom: 60 }}>
      <Pressable onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 }}>
        <Ionicons name="chevron-back" size={16} color={su.textMuted} />
        <Text style={{ color: su.textMuted, fontSize: 13 }}>User detail</Text>
      </Pressable>

      <Text style={{ color: su.text, fontSize: 24, fontWeight: '700', marginBottom: 24 }}>Edit user</Text>

      <View style={{ gap: 20, maxWidth: 600 }}>
        <Field label="First name" value={firstName} onChange={setFirstName} />
        <Field label="Last name"  value={lastName}  onChange={setLastName} />
        <Field
          label="Email"
          value={email}
          onChange={setEmail}
          note="Changing email updates their auth identity — they'll need to sign in again."
        />
        <Field label="Phone"      value={phone}     onChange={setPhone}  placeholder="+1 (555) 000-0000" />
        <Field label="Major"      value={major}     onChange={setMajor} />

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
