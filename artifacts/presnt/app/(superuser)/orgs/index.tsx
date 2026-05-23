import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, useWindowDimensions, View } from 'react-native';

import { Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { su } from '../_layout';
import type { Tables } from '@/types/database';

type Org = Tables<'organizations'>;

const FILTERS = ['All', 'Active', 'Inactive'] as const;
type Filter = typeof FILTERS[number];

export default function SuperuserOrgsScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 800;

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('All');
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadOrgs(); }, [filter]);

  async function loadOrgs() {
    setLoading(true);
    // Only fetch parent organizations — chapters are shown inside each org's detail screen
    let q = supabase
      .from('organizations')
      .select('*')
      .eq('is_deleted', false)
      .neq('type', 'chapter')           // ← exclude chapters
      .order('created_at', { ascending: false });
    if (filter === 'Active')   q = q.eq('is_active', true);
    if (filter === 'Inactive') q = q.eq('is_active', false);
    const { data } = await q.limit(100);
    setOrgs(data ?? []);
    setLoading(false);
  }

  const filtered = orgs.filter((o) =>
    o.name.toLowerCase().includes(query.toLowerCase()) ||
    (o.institution ?? '').toLowerCase().includes(query.toLowerCase())
  );

  function typeLabel(type: string) {
    if (type === 'national_hq') return 'NATIONAL';
    if (type === 'council')     return 'COUNCIL';
    return type.toUpperCase();
  }

  return (
    <View style={{ flex: 1, backgroundColor: su.bg }}>
      {/* Header */}
      <View style={{ padding: isWide ? 32 : 16, paddingBottom: 0 }}>
        <Text style={{ color: su.text, fontSize: 28, fontWeight: '700', marginBottom: 4 }}>Organizations</Text>
        <Text style={{ color: su.textMuted, fontSize: 13, marginBottom: 16 }}>
          Parent organizations — tap an org to view its chapters.
        </Text>

        {/* Search */}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: su.surface, borderRadius: 10, borderWidth: 1, borderColor: su.border, paddingHorizontal: 12, marginBottom: 14 }}>
          <Ionicons name="search-outline" size={16} color={su.textSubtle} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search organizations…"
            placeholderTextColor={su.textSubtle}
            style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 8, color: su.text, fontSize: 14, // @ts-ignore
              outline: 'none' }}
          />
        </View>

        {/* Filter pills */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
          {FILTERS.map((f) => (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: filter === f ? su.primary : su.border, backgroundColor: filter === f ? su.primary + '22' : 'transparent' }}
            >
              <Text style={{ color: filter === f ? su.primary : su.textMuted, fontSize: 13, fontWeight: filter === f ? '600' : '400' }}>{f}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator color={su.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: isWide ? 32 : 16, paddingBottom: 40 }}>
          {filtered.length === 0 ? (
            <Text style={{ color: su.textMuted, textAlign: 'center', marginTop: 40 }}>No organizations found.</Text>
          ) : (
            <View style={{ gap: 8 }}>
              {filtered.map((org) => (
                <Pressable
                  key={org.id}
                  onPress={() => router.push(`/(superuser)/orgs/${org.id}` as any)}
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? su.surfaceAlt : su.surface,
                    borderRadius: 10, borderWidth: 1, borderColor: su.border,
                    padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12,
                  })}
                >
                  {/* Org icon */}
                  <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: su.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="globe-outline" size={18} color={su.primary} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={{ color: su.text, fontSize: 15, fontWeight: '600' }}>{org.name}</Text>
                    {org.institution && (
                      <Text style={{ color: su.textMuted, fontSize: 13, marginTop: 2 }}>{org.institution}</Text>
                    )}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <View style={{ backgroundColor: '#3B82F622', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ color: '#3B82F6', fontSize: 10, fontWeight: '600' }}>{typeLabel(org.type)}</Text>
                      </View>
                      <Text style={{ color: su.textSubtle, fontSize: 11 }}>{org.slug}</Text>
                    </View>
                  </View>

                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: org.is_active ? su.success + '22' : su.border }}>
                      <Text style={{ color: org.is_active ? su.success : su.textSubtle, fontSize: 11, fontWeight: '600' }}>
                        {org.is_active ? '● Active' : '○ Inactive'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={su.textSubtle} />
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
