import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { ALL_PERMISSIONS } from '@/lib/permissions';
import { useUserViewStore, type ViewRole } from '@/stores/userViewStore';
import { su } from '../_layout';
import type { Tables } from '@/types/database';

type Org = Pick<Tables<'organizations'>, 'id' | 'name' | 'institution' | 'slug' | 'type'>;
type Chapter = Pick<Tables<'organizations'>, 'id' | 'name' | 'institution' | 'slug'>;

// ─── Other tool stubs ─────────────────────────────────────────────────────────

const TOOLS = [
  { key: 'user_view',  icon: 'eye-outline'              as const, label: 'User View',            description: 'Simulate the app as any role + entitlement set' },
  { key: 'compliance', icon: 'refresh-circle-outline'   as const, label: 'Compliance recalculate',description: 'Trigger recalculation for a member or entire org' },
  { key: 'qr',         icon: 'qr-code-outline'          as const, label: 'QR inspector',          description: 'Look up any QR code and its scan history' },
  { key: 'push',       icon: 'notifications-outline'    as const, label: 'Push tester',           description: 'Send a test push notification to any device token' },
  { key: 'attendance', icon: 'checkmark-circle-outline' as const, label: 'Attendance override',   description: 'Correct bad attendance records with audit trail' },
  { key: 'excuse',     icon: 'document-text-outline'    as const, label: 'Excuse override',       description: 'Approve or deny any excuse, bypassing officer review' },
];

function QrInspector() {
  const [code, setCode] = useState('');
  return (
    <View style={{ gap: 12 }}>
      <TextInput
        value={code}
        onChangeText={setCode}
        placeholder="Paste QR code value…"
        placeholderTextColor={su.textSubtle}
        style={{ backgroundColor: su.surface, borderRadius: 10, borderWidth: 1, borderColor: su.border, paddingHorizontal: 14, paddingVertical: 12, color: su.text, fontSize: 14, // @ts-ignore
          outline: 'none' }}
      />
      <Pressable
        style={{ backgroundColor: su.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}
        onPress={() => Alert.alert('Not connected', 'Requires GET /superadmin/support/qr/:code endpoint.')}
      >
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Look up</Text>
      </Pressable>
    </View>
  );
}

function PushTester() {
  const [token, setToken] = useState('');
  const [title, setTitle] = useState('Test from Presnt HQ');
  const [body, setBody]   = useState('This is a test push notification.');
  return (
    <View style={{ gap: 12 }}>
      {[
        { label: 'Device token', value: token, onChange: setToken, placeholder: 'ExponentPushToken[…]' },
        { label: 'Title',        value: title, onChange: setTitle, placeholder: 'Notification title' },
        { label: 'Body',         value: body,  onChange: setBody,  placeholder: 'Notification body' },
      ].map(({ label, value, onChange, placeholder }) => (
        <View key={label} style={{ gap: 6 }}>
          <Text style={{ color: su.textMuted, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</Text>
          <TextInput
            value={value}
            onChangeText={onChange}
            placeholder={placeholder}
            placeholderTextColor={su.textSubtle}
            style={{ backgroundColor: su.surface, borderRadius: 10, borderWidth: 1, borderColor: su.border, paddingHorizontal: 14, paddingVertical: 12, color: su.text, fontSize: 14, // @ts-ignore
              outline: 'none' }}
          />
        </View>
      ))}
      <Pressable
        style={{ backgroundColor: su.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}
        onPress={() => Alert.alert('Not connected', 'Requires POST /superadmin/support/push/test endpoint.')}
      >
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Send test push</Text>
      </Pressable>
    </View>
  );
}

// ─── User View tool ───────────────────────────────────────────────────────────

const VIEW_ROLES: { role: ViewRole; label: string; description: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { role: 'member',    label: 'Member',    description: 'Standard chapter member — no management access',  icon: 'person-outline'             },
  { role: 'officer',   label: 'Officer',   description: 'Choose which permissions to simulate',             icon: 'shield-half-outline'        },
  { role: 'admin',     label: 'Admin',     description: 'Full chapter admin dashboard access',              icon: 'shield-outline'             },
  { role: 'org_admin', label: 'Org Admin', description: 'Organization-level: manage chapters & members',    icon: 'shield-checkmark-outline'   },
];

function UserViewTool() {
  const { session: activeSession, start, stop } = useUserViewStore();

  // Step 1 — parent org
  const [orgs, setOrgs]               = useState<Org[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [selectedOrg, setSelectedOrg] = useState<Org | null>(null);
  const [orgSearch, setOrgSearch]     = useState('');

  // Step 2 — chapter under that org
  const [chapters, setChapters]               = useState<Chapter[]>([]);
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [chapterSearch, setChapterSearch]     = useState('');

  // Step 3 — role
  const [selectedRole, setSelectedRole] = useState<ViewRole>('member');

  // Step 4 — permissions (officer only)
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);

  // Load parent orgs (non-chapter types only) — auto-select first
  useEffect(() => {
    supabase
      .from('organizations')
      .select('id, name, institution, slug, type')
      .eq('is_deleted', false)
      .eq('is_active', true)
      .neq('type', 'chapter')
      .order('name')
      .limit(100)
      .then(({ data }) => {
        const list = (data as Org[]) ?? [];
        setOrgs(list);
        if (list.length > 0 && !selectedOrg) {
          setSelectedOrg(list[0]);
        }
        setOrgsLoading(false);
      });
  }, []);

  // Load chapters when a parent org is picked — auto-select first
  useEffect(() => {
    if (!selectedOrg) {
      setChapters([]);
      setSelectedChapter(null);
      return;
    }
    setChaptersLoading(true);
    setSelectedChapter(null);
    supabase
      .from('organizations')
      .select('id, name, institution, slug')
      .eq('parent_org_id', selectedOrg.id)
      .eq('is_deleted', false)
      .eq('type', 'chapter')
      .order('name')
      .limit(200)
      .then(({ data }) => {
        const list = (data as Chapter[]) ?? [];
        setChapters(list);
        if (list.length > 0) {
          setSelectedChapter(list[0]);
        }
        setChaptersLoading(false);
      });
  }, [selectedOrg?.id]);

  function togglePerm(perm: string) {
    setSelectedPerms((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  }

  // For org_admin role the target org is the parent org itself.
  // For all other roles, the target is the selected chapter.
  const targetOrgId = selectedRole === 'org_admin' ? selectedOrg?.id : selectedChapter?.id;
  const canLaunch   = selectedRole === 'org_admin' ? !!selectedOrg : (!!selectedOrg && !!selectedChapter);

  function handleLaunch() {
    if (!canLaunch) return;
    supabase
      .from('organizations')
      .select('*')
      .eq('id', targetOrgId as string)
      .single()
      .then(({ data: org }) => {
        if (!org) return;
        start({
          role:        selectedRole,
          org,
          permissions: selectedRole === 'officer' ? selectedPerms : [],
        });
        if (selectedRole === 'org_admin') {
          router.replace('/(org-admin)/dashboard' as any);
        } else if (selectedRole === 'admin') {
          router.replace('/(admin)/dashboard' as any);
        } else if (selectedRole === 'officer') {
          router.replace('/(officer)/events-management' as any);
        } else {
          router.replace('/(member)' as any);
        }
      });
  }

  const filteredOrgs     = orgs.filter(
    (o) =>
      o.name.toLowerCase().includes(orgSearch.toLowerCase()) ||
      (o.institution ?? '').toLowerCase().includes(orgSearch.toLowerCase())
  );
  const filteredChapters = chapters.filter(
    (c) =>
      c.name.toLowerCase().includes(chapterSearch.toLowerCase()) ||
      (c.institution ?? '').toLowerCase().includes(chapterSearch.toLowerCase())
  );

  // ── Active banner (in-tool) ─────────────────────────────────────────────
  if (activeSession) {
    const roleLabel = activeSession.role === 'org_admin' ? 'Org Admin'
      : activeSession.role === 'admin' ? 'Admin'
      : activeSession.role === 'officer' ? 'Officer'
      : 'Member';

    return (
      <View style={{ gap: 12 }}>
        <View style={{
          backgroundColor: su.surfaceAlt,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: su.primary,
          padding: 16,
          gap: 8,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: su.primary }} />
            <Text style={{ color: su.primary, fontSize: 13, fontWeight: '700' }}>User View active</Text>
          </View>
          <Text style={{ color: su.text, fontSize: 14 }}>
            <Text style={{ fontWeight: '600' }}>{roleLabel}</Text>
            {' '}in <Text style={{ fontWeight: '600' }}>{activeSession.org.name}</Text>
          </Text>
          {activeSession.role === 'officer' && activeSession.permissions.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {activeSession.permissions.map((p) => (
                <View key={p} style={{ backgroundColor: su.primary + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: su.primary, fontSize: 11, fontWeight: '600' }}>
                    {ALL_PERMISSIONS.find((x) => x.key === p)?.label ?? p}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <Pressable
          onPress={stop}
          style={({ pressed }) => ({
            borderRadius: 10,
            borderWidth: 1,
            borderColor: su.danger,
            paddingVertical: 12,
            alignItems: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ color: su.danger, fontSize: 14, fontWeight: '600' }}>Exit User View</Text>
        </Pressable>
      </View>
    );
  }

  // ── Setup form ──────────────────────────────────────────────────────────
  const stepCount = selectedRole === 'officer' ? 4 : 3;

  return (
    <View style={{ gap: 18 }}>

      {/* Step 1 — Pick parent org */}
      <View style={{ gap: 8 }}>
        <Text style={{ color: su.textMuted, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', fontWeight: '600' }}>
          1 · Select organization
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: su.bg, borderRadius: 10, borderWidth: 1, borderColor: su.border, paddingHorizontal: 10 }}>
          <Ionicons name="search-outline" size={15} color={su.textSubtle} />
          <TextInput
            value={orgSearch}
            onChangeText={setOrgSearch}
            placeholder="Search organizations…"
            placeholderTextColor={su.textSubtle}
            style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 8, color: su.text, fontSize: 13,
              // @ts-ignore
              outline: 'none' }}
          />
        </View>
        {orgsLoading ? (
          <ActivityIndicator color={su.primary} />
        ) : (
          <View style={{ maxHeight: 180 }}>
            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
              {filteredOrgs.length === 0 ? (
                <Text style={{ color: su.textSubtle, fontSize: 13, textAlign: 'center', paddingVertical: 12 }}>No organizations found</Text>
              ) : (
                filteredOrgs.map((org) => {
                  const selected = selectedOrg?.id === org.id;
                  return (
                    <Pressable
                      key={org.id}
                      onPress={() => { setSelectedOrg(org); setOrgSearch(''); }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        borderRadius: 8,
                        backgroundColor: selected ? su.primary + '18' : 'transparent',
                        borderWidth: 1,
                        borderColor: selected ? su.primary : 'transparent',
                        marginBottom: 3,
                      }}
                    >
                      <Ionicons name="globe-outline" size={16} color={selected ? su.primary : su.textSubtle} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: selected ? su.primary : su.text, fontSize: 13, fontWeight: selected ? '600' : '400' }}>{org.name}</Text>
                        {org.institution && (
                          <Text style={{ color: su.textSubtle, fontSize: 11, marginTop: 1 }}>{org.institution}</Text>
                        )}
                      </View>
                      {selected && <Ionicons name="checkmark-circle" size={16} color={su.primary} />}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Divider */}
      <View style={{ height: 1, backgroundColor: su.border }} />

      {/* Step 2 — Pick chapter (skip for org_admin role) */}
      {selectedRole !== 'org_admin' && (
        <>
          <View style={{ gap: 8 }}>
            <Text style={{ color: selectedOrg ? su.textMuted : su.textSubtle, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', fontWeight: '600' }}>
              2 · Select chapter
            </Text>
            {!selectedOrg ? (
              <Text style={{ color: su.textSubtle, fontSize: 12, paddingVertical: 8 }}>
                Pick an organization above first.
              </Text>
            ) : chaptersLoading ? (
              <ActivityIndicator color={su.primary} />
            ) : chapters.length === 0 ? (
              <View style={{ paddingVertical: 10, backgroundColor: su.surfaceAlt, borderRadius: 8, alignItems: 'center' }}>
                <Text style={{ color: su.textSubtle, fontSize: 13 }}>No chapters found under this organization.</Text>
              </View>
            ) : (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: su.bg, borderRadius: 10, borderWidth: 1, borderColor: su.border, paddingHorizontal: 10 }}>
                  <Ionicons name="search-outline" size={15} color={su.textSubtle} />
                  <TextInput
                    value={chapterSearch}
                    onChangeText={setChapterSearch}
                    placeholder="Search chapters…"
                    placeholderTextColor={su.textSubtle}
                    style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 8, color: su.text, fontSize: 13,
                      // @ts-ignore
                      outline: 'none' }}
                  />
                </View>
                <View style={{ maxHeight: 180 }}>
                  <ScrollView nestedScrollEnabled showsVerticalScrollEnabled={false}>
                    {filteredChapters.length === 0 ? (
                      <Text style={{ color: su.textSubtle, fontSize: 13, textAlign: 'center', paddingVertical: 12 }}>No chapters match</Text>
                    ) : (
                      filteredChapters.map((ch) => {
                        const selected = selectedChapter?.id === ch.id;
                        return (
                          <Pressable
                            key={ch.id}
                            onPress={() => { setSelectedChapter(ch); setChapterSearch(''); }}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 10,
                              paddingHorizontal: 12,
                              paddingVertical: 10,
                              borderRadius: 8,
                              backgroundColor: selected ? su.primary + '18' : 'transparent',
                              borderWidth: 1,
                              borderColor: selected ? su.primary : 'transparent',
                              marginBottom: 3,
                            }}
                          >
                            <Ionicons name="business-outline" size={16} color={selected ? su.primary : su.textSubtle} />
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: selected ? su.primary : su.text, fontSize: 13, fontWeight: selected ? '600' : '400' }}>{ch.name}</Text>
                              {ch.institution && (
                                <Text style={{ color: su.textSubtle, fontSize: 11, marginTop: 1 }}>{ch.institution}</Text>
                              )}
                            </View>
                            {selected && <Ionicons name="checkmark-circle" size={16} color={su.primary} />}
                          </Pressable>
                        );
                      })
                    )}
                  </ScrollView>
                </View>
              </>
            )}
          </View>
          <View style={{ height: 1, backgroundColor: su.border }} />
        </>
      )}

      {/* Step 3 — Pick role */}
      <View style={{ gap: 8 }}>
        <Text style={{ color: su.textMuted, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', fontWeight: '600' }}>
          {selectedRole !== 'org_admin' ? '3' : '2'} · Simulate role
        </Text>
        <View style={{ gap: 6 }}>
          {VIEW_ROLES.map(({ role, label, description, icon }) => {
            const selected = selectedRole === role;
            return (
              <Pressable
                key={role}
                onPress={() => {
                  setSelectedRole(role);
                  setSelectedPerms([]);
                  setChapterSearch('');
                  // When switching TO org_admin, chapter isn't used — clear it.
                  // For all other roles, keep the current selection (or fall back to first chapter).
                  if (role === 'org_admin') {
                    setSelectedChapter(null);
                  } else if (!selectedChapter && chapters.length > 0) {
                    setSelectedChapter(chapters[0]);
                  }
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: selected ? su.primary + '18' : su.bg,
                  borderWidth: 1,
                  borderColor: selected ? su.primary : su.border,
                }}
              >
                <View style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: selected ? su.primary + '30' : su.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={icon} size={18} color={selected ? su.primary : su.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: selected ? su.primary : su.text, fontSize: 14, fontWeight: selected ? '600' : '400' }}>{label}</Text>
                  <Text style={{ color: su.textSubtle, fontSize: 11, marginTop: 1 }}>{description}</Text>
                </View>
                <View style={{
                  width: 18, height: 18, borderRadius: 9,
                  borderWidth: 2,
                  borderColor: selected ? su.primary : su.border,
                  backgroundColor: selected ? su.primary : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {selected && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' }} />}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Org Admin note */}
      {selectedRole === 'org_admin' && (
        <View style={{ backgroundColor: '#3B82F612', borderWidth: 1, borderColor: '#3B82F640', borderRadius: 10, padding: 12, flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <Ionicons name="information-circle-outline" size={15} color="#3B82F6" style={{ marginTop: 1 }} />
          <Text style={{ color: '#3B82F6', fontSize: 12, flex: 1, lineHeight: 18 }}>
            The org admin portal is launched at the organization level — no chapter selection needed.
          </Text>
        </View>
      )}

      {/* Step 4 — Officer permissions (only when officer selected) */}
      {selectedRole === 'officer' && (
        <>
          <View style={{ height: 1, backgroundColor: su.border }} />
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: su.textMuted, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', fontWeight: '600' }}>
                4 · Permissions
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable onPress={() => setSelectedPerms(ALL_PERMISSIONS.map((p) => p.key))}>
                  <Text style={{ color: su.primary, fontSize: 12 }}>All</Text>
                </Pressable>
                <Pressable onPress={() => setSelectedPerms([])}>
                  <Text style={{ color: su.textMuted, fontSize: 12 }}>None</Text>
                </Pressable>
              </View>
            </View>
            <View style={{ gap: 4 }}>
              {ALL_PERMISSIONS.map((p) => {
                const on = selectedPerms.includes(p.key);
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => togglePerm(p.key)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: 8,
                      backgroundColor: on ? su.primary + '12' : 'transparent',
                    }}
                  >
                    <View style={{
                      width: 18, height: 18, borderRadius: 4,
                      borderWidth: 1.5,
                      borderColor: on ? su.primary : su.border,
                      backgroundColor: on ? su.primary : 'transparent',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {on && <Ionicons name="checkmark" size={12} color="#fff" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: on ? su.text : su.textMuted, fontSize: 13, fontWeight: on ? '500' : '400' }}>{p.label}</Text>
                      <Text style={{ color: su.textSubtle, fontSize: 11, marginTop: 1 }}>{p.description}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </>
      )}

      {/* Launch button */}
      <Pressable
        onPress={handleLaunch}
        disabled={!canLaunch}
        style={({ pressed }) => ({
          backgroundColor: canLaunch ? su.primary : su.surfaceAlt,
          borderRadius: 10,
          paddingVertical: 14,
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 8,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Ionicons name="eye-outline" size={16} color={canLaunch ? '#fff' : su.textSubtle} />
        <Text style={{ color: canLaunch ? '#fff' : su.textSubtle, fontSize: 14, fontWeight: '600' }}>
          Launch User View
        </Text>
      </Pressable>

      {!canLaunch && (
        <Text style={{ color: su.textSubtle, fontSize: 12, textAlign: 'center', marginTop: -8 }}>
          {!selectedOrg
            ? 'Select an organization to continue'
            : selectedRole !== 'org_admin' && !selectedChapter
            ? 'Select a chapter to continue'
            : 'Select a role to continue'}
        </Text>
      )}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SuperuserSupportScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 800;
  const [active, setActive] = useState<string | null>('user_view'); // open by default

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: su.bg }}
      contentContainerStyle={{ padding: isWide ? 32 : 16, paddingBottom: 80 }}
    >
      <Text style={{ color: su.text, fontSize: 28, fontWeight: '700', marginBottom: 6 }}>Support tools</Text>
      <Text style={{ color: su.textMuted, fontSize: 13, marginBottom: 24 }}>Platform-level overrides and debug utilities</Text>

      <View style={{ gap: 12 }}>
        {TOOLS.map((tool) => (
          <View
            key={tool.key}
            style={{
              backgroundColor: su.surface,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: active === tool.key ? su.primary : su.border,
              overflow: 'hidden',
            }}
          >
            <Pressable
              onPress={() => setActive(active === tool.key ? null : tool.key)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: su.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={tool.icon} size={20} color={su.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: su.text, fontSize: 15, fontWeight: '600' }}>{tool.label}</Text>
                <Text style={{ color: su.textMuted, fontSize: 12, marginTop: 3 }}>{tool.description}</Text>
              </View>
              <Ionicons name={active === tool.key ? 'chevron-up' : 'chevron-down'} size={16} color={su.textSubtle} />
            </Pressable>

            {active === tool.key && (
              <View style={{ padding: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: su.border }}>
                {tool.key === 'user_view'  && <UserViewTool />}
                {tool.key === 'qr'         && <QrInspector />}
                {tool.key === 'push'       && <PushTester />}
                {(tool.key === 'compliance' || tool.key === 'attendance' || tool.key === 'excuse') && (
                  <View style={{ padding: 16, backgroundColor: su.surfaceAlt, borderRadius: 10, alignItems: 'center' }}>
                    <Text style={{ color: su.textMuted, fontSize: 13, textAlign: 'center' }}>
                      Full UI for <Text style={{ color: su.primary }}>{tool.label}</Text> requires event/member data from Phase 3+.
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
