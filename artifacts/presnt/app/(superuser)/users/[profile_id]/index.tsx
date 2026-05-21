import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { su } from '../../_layout';
import type { Tables } from '@/types/database';

type Profile = Tables<'profiles'>;
type Membership = Tables<'memberships'> & { organizations: Tables<'organizations'> | null };

export default function UserDetailScreen() {
  const { profile_id } = useLocalSearchParams<{ profile_id: string }>();
  const { width } = useWindowDimensions();
  const isWide = width >= 800;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadUser(); }, [profile_id]);

  async function loadUser() {
    setLoading(true);
    const [{ data: profileData }, { data: memberData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', profile_id as string).single(),
      supabase.from('memberships').select('*, organizations(*)').eq('user_id', profile_id as string).eq('is_deleted', false),
    ]);
    setProfile(profileData);
    setMemberships((memberData as Membership[]) ?? []);
    setLoading(false);
  }

  async function handleForceLogout() {
    Alert.alert(
      'Force logout',
      `This will invalidate all active sessions for ${profile?.first_name} ${profile?.last_name}. They will be signed out immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Force logout', style: 'destructive', onPress: () => Alert.alert('API not yet connected', 'Requires /superadmin/profiles/:id/force-logout endpoint.') },
      ],
    );
  }

  if (loading) return <View style={{ flex: 1, backgroundColor: su.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={su.primary} /></View>;
  if (!profile) return <View style={{ flex: 1, backgroundColor: su.bg, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: su.textMuted }}>User not found.</Text></View>;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: su.bg }} contentContainerStyle={{ padding: isWide ? 32 : 16, paddingBottom: 48 }}>
      <Pressable onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 }}>
        <Ionicons name="chevron-back" size={16} color={su.textMuted} />
        <Text style={{ color: su.textMuted, fontSize: 13 }}>Users</Text>
      </Pressable>

      {/* Profile card */}
      <View style={{ backgroundColor: su.surface, borderRadius: 14, borderWidth: 1, borderColor: su.border, padding: 20, marginBottom: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: su.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: su.primary, fontSize: 20, fontWeight: '700' }}>
              {profile.first_name?.[0]}{profile.last_name?.[0]}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: su.text, fontSize: 20, fontWeight: '700' }}>{profile.first_name} {profile.last_name}</Text>
            <Text style={{ color: su.textMuted, fontSize: 13, marginTop: 3 }}>{profile.email}</Text>
            {profile.is_superuser && (
              <View style={{ marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: su.primary + '33' }}>
                <Text style={{ color: su.primary, fontSize: 11, fontWeight: '600' }}>SUPERUSER</Text>
              </View>
            )}
          </View>
        </View>

        {/* Actions */}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Pressable
            onPress={() => router.push(`/(superuser)/users/${profile.id}/editor` as any)}
            style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: su.border }}
          >
            <Text style={{ color: su.textMuted, fontSize: 13 }}>Edit profile</Text>
          </Pressable>
          <Pressable
            onPress={handleForceLogout}
            style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: su.danger }}
          >
            <Text style={{ color: su.danger, fontSize: 13 }}>Force logout</Text>
          </Pressable>
        </View>
      </View>

      {/* Details */}
      <View style={{ backgroundColor: su.surface, borderRadius: 12, borderWidth: 1, borderColor: su.border, padding: 16, marginBottom: 20 }}>
        <Text style={{ color: su.textMuted, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12 }}>DETAILS</Text>
        {[
          { label: 'Phone',       value: profile.phone },
          { label: 'Major',       value: profile.major },
          { label: 'Grad year',   value: profile.graduation_year?.toString() },
          { label: 'Member since', value: profile.created_at ? new Date(profile.created_at).toLocaleDateString() : undefined },
        ].map(({ label, value }) => (
          <View key={label} style={{ flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: su.border, gap: 12 }}>
            <Text style={{ color: su.textMuted, fontSize: 13, width: 120 }}>{label}</Text>
            <Text style={{ color: su.text, fontSize: 13, flex: 1 }}>{value ?? '—'}</Text>
          </View>
        ))}
      </View>

      {/* Memberships */}
      <Text style={{ color: su.textMuted, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12 }}>MEMBERSHIPS</Text>
      {memberships.length === 0 ? (
        <Text style={{ color: su.textSubtle, fontSize: 13 }}>No memberships.</Text>
      ) : (
        <View style={{ gap: 8 }}>
          {memberships.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => router.push(`/(superuser)/orgs/${m.org_id}` as any)}
              style={{ backgroundColor: su.surface, borderRadius: 10, borderWidth: 1, borderColor: su.border, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: su.text, fontSize: 14, fontWeight: '600' }}>{m.organizations?.name ?? m.org_id}</Text>
                <Text style={{ color: su.textMuted, fontSize: 12, marginTop: 2 }}>
                  Joined {m.joined_at ?? '—'} · {m.status}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={su.textSubtle} />
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
