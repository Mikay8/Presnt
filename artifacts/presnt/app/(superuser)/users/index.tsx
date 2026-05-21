import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, useWindowDimensions, View } from 'react-native';

import { Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { su } from '../_layout';
import type { Tables } from '@/types/database';

type Profile = Tables<'profiles'>;

export default function SuperuserUsersScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 800;

  const [query, setQuery] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadProfiles(); }, []);

  async function loadProfiles() {
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    setProfiles(data ?? []);
    setLoading(false);
  }

  const filtered = profiles.filter((p) =>
    `${p.first_name} ${p.last_name} ${p.email}`.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <View style={{ flex: 1, backgroundColor: su.bg }}>
      <View style={{ padding: isWide ? 32 : 16, paddingBottom: 0 }}>
        <Text style={{ color: su.text, fontSize: 28, fontWeight: '700', marginBottom: 16 }}>Users</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: su.surface, borderRadius: 10, borderWidth: 1, borderColor: su.border, paddingHorizontal: 12, marginBottom: 20 }}>
          <Ionicons name="search-outline" size={16} color={su.textSubtle} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or email…"
            placeholderTextColor={su.textSubtle}
            style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 8, color: su.text, fontSize: 14, // @ts-ignore
              outline: 'none' }}
          />
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={su.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: isWide ? 32 : 16, paddingBottom: 40 }}>
          <Text style={{ color: su.textSubtle, fontSize: 12, marginBottom: 12 }}>{filtered.length} users</Text>
          <View style={{ gap: 8 }}>
            {filtered.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => router.push(`/(superuser)/users/${p.id}` as any)}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? su.surfaceAlt : su.surface,
                  borderRadius: 10, borderWidth: 1, borderColor: su.border,
                  padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
                })}
              >
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: su.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: su.primary, fontSize: 14, fontWeight: '700' }}>
                    {p.first_name?.[0]}{p.last_name?.[0]}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: su.text, fontSize: 14, fontWeight: '600' }}>{p.first_name} {p.last_name}</Text>
                  <Text style={{ color: su.textMuted, fontSize: 12, marginTop: 2 }}>{p.email}</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={su.textSubtle} />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
