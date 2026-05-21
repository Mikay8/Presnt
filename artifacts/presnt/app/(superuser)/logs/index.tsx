import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { su } from '../_layout';

const TABS = ['Platform audit', 'Restrictions', 'Errors'] as const;
type Tab = typeof TABS[number];

interface AuditEntry {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  notes: string | null;
  created_at: string;
  profiles: { first_name: string; last_name: string } | null;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const ACTION_COLOR: Record<string, string> = {
  'org.viewed': '#3B82F6',
  'org.deactivated': '#C0392B',
  'org.reactivated': '#5C8A57',
  'org.field_edited': '#C99432',
  'org.impersonated': '#E26B4A',
  'profile.viewed': '#3B82F6',
  'profile.edited': '#C99432',
  'profile.force_logged_out': '#C0392B',
};

export default function SuperuserLogsScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 800;

  const [activeTab, setActiveTab] = useState<Tab>('Platform audit');
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeTab === 'Platform audit') loadLogs();
  }, [activeTab]);

  async function loadLogs() {
    setLoading(true);
    const { data } = await supabase
      .from('superuser_audit_log')
      .select('*, profiles(first_name, last_name)')
      .order('created_at', { ascending: false })
      .limit(50);
    setLogs((data as AuditEntry[]) ?? []);
    setLoading(false);
  }

  return (
    <View style={{ flex: 1, backgroundColor: su.bg }}>
      <View style={{ padding: isWide ? 32 : 16, paddingBottom: 0 }}>
        <Text style={{ color: su.text, fontSize: 28, fontWeight: '700', marginBottom: 20 }}>Logs & audit</Text>

        {/* Tabs */}
        <View style={{ flexDirection: 'row', gap: 4 }}>
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

      {activeTab === 'Platform audit' && (
        loading ? (
          <ActivityIndicator color={su.primary} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView contentContainerStyle={{ paddingHorizontal: isWide ? 32 : 16, paddingBottom: 48 }}>
            {logs.length === 0 ? (
              <Text style={{ color: su.textMuted, textAlign: 'center', marginTop: 40 }}>
                No audit log entries yet. Actions performed by superusers will appear here.
              </Text>
            ) : (
              <View style={{ gap: 8 }}>
                {logs.map((entry) => (
                  <View key={entry.id} style={{ backgroundColor: su.surface, borderRadius: 10, borderWidth: 1, borderColor: su.border, padding: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: (ACTION_COLOR[entry.action] ?? su.textSubtle) + '22' }}>
                        <Text style={{ color: ACTION_COLOR[entry.action] ?? su.textSubtle, fontSize: 11, fontWeight: '600' }}>
                          {entry.action}
                        </Text>
                      </View>
                      <Text style={{ color: su.textSubtle, fontSize: 11, marginLeft: 'auto' }}>{timeAgo(entry.created_at)}</Text>
                    </View>
                    {entry.notes && <Text style={{ color: su.textMuted, fontSize: 13 }}>{entry.notes}</Text>}
                    {entry.target_type && (
                      <Text style={{ color: su.textSubtle, fontSize: 11, marginTop: 4 }}>
                        {entry.target_type} · {entry.target_id?.slice(0, 8)}…
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        )
      )}

      {activeTab === 'Restrictions' && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ color: su.textMuted, fontSize: 14, textAlign: 'center' }}>
            Member restriction log across all orgs.{'\n'}Available once member_restrictions table is added in Phase 3+.
          </Text>
        </View>
      )}

      {activeTab === 'Errors' && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ color: su.textMuted, fontSize: 14, textAlign: 'center' }}>
            Error log feed.{'\n'}Will display Sentry errors tagged with org context once Sentry is connected.
          </Text>
        </View>
      )}
    </View>
  );
}
