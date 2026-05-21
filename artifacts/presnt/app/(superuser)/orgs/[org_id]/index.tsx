import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { su } from '../../_layout';
import type { Tables } from '@/types/database';

type Org = Tables<'organizations'>;
type Member = Tables<'memberships'> & { profiles: Tables<'profiles'> | null };

const TABS = ['Info', 'Members', 'Audit'] as const;
type Tab = typeof TABS[number];

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: su.border, gap: 12 }}>
      <Text style={{ color: su.textMuted, fontSize: 13, width: 130 }}>{label}</Text>
      <Text style={{ color: su.text, fontSize: 13, flex: 1 }}>{value ?? '—'}</Text>
    </View>
  );
}

export default function OrgDetailScreen() {
  const { org_id } = useLocalSearchParams<{ org_id: string }>();
  const { width } = useWindowDimensions();
  const isWide = width >= 800;

  const [org, setOrg] = useState<Org | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('Info');
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => { loadOrg(); }, [org_id]);

  async function loadOrg() {
    setLoading(true);
    const [{ data: orgData }, { data: memberData }] = await Promise.all([
      supabase.from('organizations').select('*').eq('id', org_id as string).single(),
      supabase.from('memberships').select('*, profiles(*)').eq('org_id', org_id as string).eq('is_deleted', false).limit(50),
    ]);
    setOrg(orgData);
    setMembers((memberData as Member[]) ?? []);
    setLoading(false);
  }

  async function toggleActive() {
    if (!org) return;
    const newState = !org.is_active;
    Alert.alert(
      newState ? 'Reactivate org' : 'Deactivate org',
      newState
        ? `Reactivate ${org.name}? Members will regain access.`
        : `Deactivate ${org.name}? Members will lose access immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: newState ? 'Reactivate' : 'Deactivate',
          style: newState ? 'default' : 'destructive',
          onPress: async () => {
            setToggling(true);
            await supabase.from('organizations').update({ is_active: newState }).eq('id', org.id);
            setOrg({ ...org, is_active: newState });
            setToggling(false);
          },
        },
      ],
    );
  }

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: su.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={su.primary} /></View>;
  }
  if (!org) {
    return <View style={{ flex: 1, backgroundColor: su.bg, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: su.textMuted }}>Org not found.</Text></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: su.bg }}>
      {/* Header */}
      <View style={{ padding: isWide ? 32 : 16, paddingBottom: 0 }}>
        <Pressable onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 }}>
          <Ionicons name="chevron-back" size={16} color={su.textMuted} />
          <Text style={{ color: su.textMuted, fontSize: 13 }}>Orgs</Text>
        </Pressable>

        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: su.text, fontSize: 24, fontWeight: '700' }}>{org.name}</Text>
            <Text style={{ color: su.textMuted, fontSize: 13, marginTop: 4 }}>{org.institution} · {org.slug}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={() => router.push(`/(superuser)/orgs/${org.id}/settings` as any)}
              style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: su.border }}
            >
              <Text style={{ color: su.textMuted, fontSize: 13 }}>Edit</Text>
            </Pressable>
            <Pressable
              onPress={toggleActive}
              disabled={toggling}
              style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: org.is_active ? su.danger : su.success }}
            >
              <Text style={{ color: org.is_active ? su.danger : su.success, fontSize: 13 }}>
                {toggling ? '…' : org.is_active ? 'Deactivate' : 'Reactivate'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Tabs */}
        <View style={{ flexDirection: 'row', gap: 4, marginBottom: 0 }}>
          {TABS.map((t) => (
            <Pressable
              key={t}
              onPress={() => setActiveTab(t)}
              style={{ paddingHorizontal: 16, paddingVertical: 9, borderBottomWidth: 2, borderBottomColor: activeTab === t ? su.primary : 'transparent' }}
            >
              <Text style={{ color: activeTab === t ? su.primary : su.textMuted, fontSize: 14, fontWeight: activeTab === t ? '600' : '400' }}>{t}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ height: 1, backgroundColor: su.border, marginHorizontal: isWide ? -32 : -16, marginBottom: 20 }} />
      </View>

      {/* Tab content */}
      <ScrollView contentContainerStyle={{ paddingHorizontal: isWide ? 32 : 16, paddingBottom: 48 }}>
        {activeTab === 'Info' && (
          <View style={{ gap: 20 }}>
            {/* Identity */}
            <View style={{ backgroundColor: su.surface, borderRadius: 12, borderWidth: 1, borderColor: su.border, padding: 16 }}>
              <Text style={{ color: su.textMuted, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>IDENTITY</Text>
              <InfoRow label="Name"        value={org.name} />
              <InfoRow label="Slug"        value={org.slug} />
              <InfoRow label="Type"        value={org.type} />
              <InfoRow label="Institution" value={org.institution} />
              <InfoRow label="Greek org"   value={org.greek_letter_org} />
              <InfoRow label="Timezone"    value={org.timezone} />
              <InfoRow label="Status"      value={org.is_active ? 'Active' : 'Inactive'} />
            </View>

            {/* Branding */}
            <View style={{ backgroundColor: su.surface, borderRadius: 12, borderWidth: 1, borderColor: su.border, padding: 16 }}>
              <Text style={{ color: su.textMuted, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>BRANDING</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: su.border, gap: 12 }}>
                <Text style={{ color: su.textMuted, fontSize: 13, width: 130 }}>Primary color</Text>
                <View style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: org.primary_color ?? su.primary }} />
                <Text style={{ color: su.text, fontSize: 13 }}>{org.primary_color ?? '—'}</Text>
              </View>
              <InfoRow label="Display name" value={org.app_display_name} />
              <InfoRow label="Color scheme" value={org.color_scheme} />
            </View>
          </View>
        )}

        {activeTab === 'Members' && (
          <View style={{ gap: 8 }}>
            {members.length === 0 ? (
              <Text style={{ color: su.textMuted, textAlign: 'center', marginTop: 32 }}>No members found.</Text>
            ) : members.map((m) => (
              <View key={m.id} style={{ backgroundColor: su.surface, borderRadius: 10, borderWidth: 1, borderColor: su.border, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: su.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: su.primary, fontSize: 12, fontWeight: '700' }}>
                    {m.profiles?.first_name?.[0] ?? '?'}{m.profiles?.last_name?.[0] ?? ''}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: su.text, fontSize: 14, fontWeight: '600' }}>
                    {m.profiles?.first_name} {m.profiles?.last_name}
                  </Text>
                  <Text style={{ color: su.textMuted, fontSize: 12, marginTop: 2 }}>{m.profiles?.email}</Text>
                </View>
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: su.surfaceAlt }}>
                  <Text style={{ color: su.textMuted, fontSize: 11 }}>{m.status}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {activeTab === 'Audit' && (
          <View style={{ backgroundColor: su.surface, borderRadius: 12, borderWidth: 1, borderColor: su.border, padding: 20, alignItems: 'center' }}>
            <Ionicons name="document-text-outline" size={32} color={su.textSubtle} />
            <Text style={{ color: su.textMuted, fontSize: 14, marginTop: 12 }}>Audit log coming soon.</Text>
            <Text style={{ color: su.textSubtle, fontSize: 12, marginTop: 6, textAlign: 'center' }}>
              Will show actions performed on this org from superuser_audit_log.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
