/**
 * Superuser — Logs & Audit
 *
 * Tabs
 *  • Platform audit  – superuser_audit_log entries (superuser actions)
 *  • API logs        – api_request_log grouped by domain, each row expandable
 *  • Errors          – api_request_log where status = 'error', same expandable rows
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';

import { Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { su } from '../_layout';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface AuditEntry {
  id:          string;
  action:      string;
  target_type: string | null;
  target_id:   string | null;
  notes:       string | null;
  created_at:  string;
  profiles:    { first_name: string; last_name: string } | null;
}

interface ApiLogEntry {
  id:            string;
  created_at:    string;
  user_id:       string | null;
  org_id:        string | null;
  method:        string;
  endpoint:      string;
  domain:        string;
  status:        string;
  status_code:   number | null;
  duration_ms:   number | null;
  request_body:  Record<string, unknown> | null;
  response_meta: Record<string, unknown> | null;
  error_message: string | null;
}

// ─── Domain display config ─────────────────────────────────────────────────────

const DOMAIN_ORDER = [
  'auth', 'events', 'members', 'attendance', 'excuses',
  'locations', 'roles', 'config', 'billing', 'orgs', 'other',
];

const DOMAIN_LABELS: Record<string, string> = {
  auth:       'Auth & Sessions',
  events:     'Events',
  members:    'Members',
  attendance: 'Attendance',
  excuses:    'Excuses',
  locations:  'Saved Locations',
  roles:      'Roles & Permissions',
  config:     'App Config',
  billing:    'Billing',
  orgs:       'Organizations',
  other:      'Other',
};

const DOMAIN_ICON: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  auth:       'key-outline',
  events:     'calendar-outline',
  members:    'people-outline',
  attendance: 'checkmark-done-outline',
  excuses:    'document-text-outline',
  locations:  'location-outline',
  roles:      'shield-outline',
  config:     'settings-outline',
  billing:    'card-outline',
  orgs:       'business-outline',
  other:      'ellipsis-horizontal-circle-outline',
};

// ─── Helper: status code → colour ─────────────────────────────────────────────

function statusColor(code: number | null, status: string) {
  if (status === 'error' || (code && code >= 500)) return su.danger;
  if (code && code >= 400) return su.warning;
  return su.success;
}

function methodColor(m: string) {
  if (m === 'GET')    return '#3B82F6';
  if (m === 'POST')   return su.success;
  if (m === 'PATCH')  return su.warning;
  if (m === 'DELETE') return su.danger;
  return su.textMuted;
}

// ─── timeAgo ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Expandable API log row ────────────────────────────────────────────────────

function ApiLogRow({ entry }: { entry: ApiLogEntry }) {
  const [open, setOpen] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  function toggle() {
    const toValue = open ? 0 : 1;
    setOpen(!open);
    Animated.spring(anim, { toValue, useNativeDriver: false, tension: 180, friction: 20 }).start();
  }

  const sc = entry.status_code;
  const sColor = statusColor(sc, entry.status);

  return (
    <View style={{ borderWidth: 1, borderColor: su.border, borderRadius: 10, overflow: 'hidden', marginBottom: 6 }}>
      {/* ── Collapsed header row ── */}
      <Pressable
        onPress={toggle}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 14,
          paddingVertical: 11,
          backgroundColor: pressed ? su.surfaceAlt : su.surface,
        })}
      >
        {/* Method badge */}
        <View style={{
          width: 58,
          alignItems: 'center',
          paddingVertical: 3,
          borderRadius: 5,
          backgroundColor: methodColor(entry.method) + '22',
        }}>
          <Text style={{ color: methodColor(entry.method), fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}>
            {entry.method}
          </Text>
        </View>

        {/* Endpoint */}
        <Text style={{ color: su.text, fontSize: 13, fontWeight: '500', flex: 1 }} numberOfLines={1}>
          {entry.endpoint}
        </Text>

        {/* Status code */}
        <View style={{
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 5,
          backgroundColor: sColor + '22',
          marginRight: 4,
        }}>
          <Text style={{ color: sColor, fontSize: 11, fontWeight: '600' }}>
            {sc ?? entry.status}
          </Text>
        </View>

        {/* Duration */}
        {entry.duration_ms != null && (
          <Text style={{ color: su.textSubtle, fontSize: 11, width: 52, textAlign: 'right' }}>
            {entry.duration_ms}ms
          </Text>
        )}

        {/* Time */}
        <Text style={{ color: su.textSubtle, fontSize: 11, width: 68, textAlign: 'right' }}>
          {timeAgo(entry.created_at)}
        </Text>

        {/* Chevron */}
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={su.textSubtle}
          style={{ marginLeft: 4 }}
        />
      </Pressable>

      {/* ── Expanded detail panel ── */}
      {open && (
        <View style={{ backgroundColor: su.bg, borderTopWidth: 1, borderTopColor: su.border, padding: 14, gap: 10 }}>
          {/* Meta row */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
            <DetailCell label="Timestamp" value={`${fmtDate(entry.created_at)}  ${fmtTime(entry.created_at)}`} />
            <DetailCell label="Domain"    value={DOMAIN_LABELS[entry.domain] ?? entry.domain} />
            {entry.org_id  && <DetailCell label="Org ID"  value={entry.org_id.slice(0, 8) + '…'} mono />}
            {entry.user_id && <DetailCell label="User ID" value={entry.user_id.slice(0, 8) + '…'} mono />}
            {entry.duration_ms != null && <DetailCell label="Duration" value={`${entry.duration_ms} ms`} />}
          </View>

          {/* Request body */}
          {entry.request_body && Object.keys(entry.request_body).length > 0 && (
            <JsonBlock label="Request" data={entry.request_body} />
          )}

          {/* Response meta */}
          {entry.response_meta && Object.keys(entry.response_meta).length > 0 && (
            <JsonBlock label="Response" data={entry.response_meta} accent={entry.status === 'error' ? su.danger : su.success} />
          )}

          {/* Error message */}
          {entry.error_message && (
            <View style={{ backgroundColor: su.danger + '18', borderRadius: 8, padding: 10, borderLeftWidth: 3, borderLeftColor: su.danger }}>
              <Text style={{ color: su.danger, fontSize: 11, fontWeight: '600', marginBottom: 3 }}>ERROR</Text>
              <Text style={{ color: su.text, fontSize: 12, fontFamily: 'monospace' }}>{entry.error_message}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function DetailCell({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={{ minWidth: 120 }}>
      <Text style={{ color: su.textSubtle, fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 }}>{label}</Text>
      <Text style={{ color: su.text, fontSize: 12, fontFamily: mono ? 'monospace' : undefined }}>{value}</Text>
    </View>
  );
}

function JsonBlock({ label, data, accent }: { label: string; data: Record<string, unknown>; accent?: string }) {
  return (
    <View>
      <Text style={{ color: su.textSubtle, fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>{label}</Text>
      <View style={{ backgroundColor: su.surfaceAlt, borderRadius: 8, padding: 10, borderLeftWidth: 2, borderLeftColor: accent ?? su.primary }}>
        <Text style={{ color: su.textMuted, fontSize: 11, fontFamily: 'monospace', lineHeight: 18 }}>
          {JSON.stringify(data, null, 2)}
        </Text>
      </View>
    </View>
  );
}

// ─── Domain section (Platform audit / API logs) ───────────────────────────────

function DomainSection({ domain, entries }: { domain: string; entries: ApiLogEntry[] }) {
  const [collapsed, setCollapsed] = useState(false);

  const errorCount = entries.filter(e => e.status === 'error').length;
  const icon = DOMAIN_ICON[domain] ?? 'ellipsis-horizontal-circle-outline';

  return (
    <View style={{ marginBottom: 20 }}>
      {/* Section header */}
      <Pressable
        onPress={() => setCollapsed(!collapsed)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingVertical: 10,
          paddingHorizontal: 2,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Ionicons name={icon} size={16} color={su.primary} />
        <Text style={{ color: su.text, fontSize: 15, fontWeight: '700', flex: 1 }}>
          {DOMAIN_LABELS[domain] ?? domain}
        </Text>
        {errorCount > 0 && (
          <View style={{ backgroundColor: su.danger + '33', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ color: su.danger, fontSize: 11, fontWeight: '600' }}>{errorCount} error{errorCount > 1 ? 's' : ''}</Text>
          </View>
        )}
        <View style={{ backgroundColor: su.surfaceAlt, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginRight: 4 }}>
          <Text style={{ color: su.textMuted, fontSize: 11 }}>{entries.length}</Text>
        </View>
        <Ionicons name={collapsed ? 'chevron-down' : 'chevron-up'} size={14} color={su.textSubtle} />
      </Pressable>

      {!collapsed && (
        <View>
          {entries.map(e => <ApiLogRow key={e.id} entry={e} />)}
        </View>
      )}
    </View>
  );
}

// ─── Audit entry card ──────────────────────────────────────────────────────────

const ACTION_COLOR: Record<string, string> = {
  'org.viewed':            '#3B82F6',
  'org.deactivated':       '#C0392B',
  'org.reactivated':       '#5C8A57',
  'org.field_edited':      '#C99432',
  'org.impersonated':      '#E26B4A',
  'profile.viewed':        '#3B82F6',
  'profile.edited':        '#C99432',
  'profile.force_logged_out': '#C0392B',
};

function AuditCard({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  const color = ACTION_COLOR[entry.action] ?? su.textSubtle;
  const name = entry.profiles
    ? `${entry.profiles.first_name} ${entry.profiles.last_name}`
    : 'System';

  return (
    <View style={{ borderWidth: 1, borderColor: su.border, borderRadius: 10, overflow: 'hidden', marginBottom: 6 }}>
      <Pressable
        onPress={() => setOpen(!open)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          padding: 14,
          backgroundColor: pressed ? su.surfaceAlt : su.surface,
        })}
      >
        <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: color + '22' }}>
          <Text style={{ color, fontSize: 11, fontWeight: '600' }}>{entry.action}</Text>
        </View>
        <Text style={{ color: su.textMuted, fontSize: 13, flex: 1 }} numberOfLines={1}>
          {name}
        </Text>
        <Text style={{ color: su.textSubtle, fontSize: 11 }}>{timeAgo(entry.created_at)}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={su.textSubtle} style={{ marginLeft: 4 }} />
      </Pressable>

      {open && (
        <View style={{ backgroundColor: su.bg, borderTopWidth: 1, borderTopColor: su.border, padding: 14, gap: 8 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
            <DetailCell label="Timestamp" value={`${fmtDate(entry.created_at)}  ${fmtTime(entry.created_at)}`} />
            <DetailCell label="Performed by" value={name} />
            {entry.target_type && <DetailCell label="Target type" value={entry.target_type} />}
            {entry.target_id   && <DetailCell label="Target ID"   value={entry.target_id.slice(0, 8) + '…'} mono />}
          </View>
          {entry.notes && (
            <View style={{ backgroundColor: su.surfaceAlt, borderRadius: 8, padding: 10 }}>
              <Text style={{ color: su.textSubtle, fontSize: 10, fontWeight: '600', letterSpacing: 0.8, marginBottom: 4 }}>NOTES</Text>
              <Text style={{ color: su.textMuted, fontSize: 13 }}>{entry.notes}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Toolbar (search + filter chips) ──────────────────────────────────────────

const METHOD_FILTERS = ['ALL', 'GET', 'POST', 'PATCH', 'DELETE'] as const;

function FilterBar({
  methodFilter,
  onMethodChange,
  count,
}: {
  methodFilter: string;
  onMethodChange: (m: string) => void;
  count: number;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
      {METHOD_FILTERS.map(m => (
        <Pressable
          key={m}
          onPress={() => onMethodChange(m)}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 5,
            borderRadius: 20,
            backgroundColor: methodFilter === m ? su.primary + '33' : su.surfaceAlt,
            borderWidth: 1,
            borderColor: methodFilter === m ? su.primary : 'transparent',
          }}
        >
          <Text style={{ color: methodFilter === m ? su.primary : su.textMuted, fontSize: 12, fontWeight: '600' }}>{m}</Text>
        </Pressable>
      ))}
      <Text style={{ color: su.textSubtle, fontSize: 12, marginLeft: 'auto' }}>{count} entries</Text>
    </View>
  );
}

// ─── Clear sheet ──────────────────────────────────────────────────────────────

const CLEAR_OPTIONS = [
  { label: 'Last hour',    hours: 1,    desc: 'Delete entries from the past hour' },
  { label: 'Last 24 h',   hours: 24,   desc: 'Delete entries from the past day' },
  { label: 'Last 7 days',  hours: 168,  desc: 'Delete entries from the past week' },
  { label: 'Last 30 days', hours: 720,  desc: 'Delete entries from the past month' },
  { label: 'All logs',     hours: null, desc: 'Permanently delete every API log entry' },
] as const;

type ClearOption = typeof CLEAR_OPTIONS[number];

function ClearSheet({
  visible,
  onClose,
  onCleared,
}: {
  visible:   boolean;
  onClose:   () => void;
  onCleared: (count: number) => void;
}) {
  const [pending,  setPending]  = useState<ClearOption | null>(null);
  const [clearing, setClearing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reset state when sheet reopens
  React.useEffect(() => {
    if (!visible) { setPending(null); setErrorMsg(null); }
  }, [visible]);

  async function executeClear(opt: ClearOption) {
    setClearing(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase
        .rpc('clear_api_request_log', { older_than_hours: opt.hours ?? undefined });
      if (error) throw error;
      onCleared((data as number) ?? 0);
      onClose();
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Could not clear logs.');
      setClearing(false);
      setPending(null);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        {/* Stop backdrop tap-through */}
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View style={{
            backgroundColor: su.surface,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingTop: 12,
            paddingBottom: 40,
          }}>
            {/* Handle */}
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: su.border, alignSelf: 'center', marginBottom: 20 }} />

            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 6 }}>
              <Ionicons name="trash-outline" size={18} color={su.danger} style={{ marginRight: 8 }} />
              <Text style={{ color: su.text, fontSize: 17, fontWeight: '700', flex: 1 }}>Clear API logs</Text>
              <Pressable onPress={onClose} style={{ padding: 6 }}>
                <Ionicons name="close" size={20} color={su.textMuted} />
              </Pressable>
            </View>

            <Text style={{ color: su.textMuted, fontSize: 13, paddingHorizontal: 20, marginBottom: 20, lineHeight: 19 }}>
              Entries are auto-cleared after 7 days. You can also manually remove them below.
            </Text>

            {/* Error banner */}
            {errorMsg && (
              <View style={{ marginHorizontal: 20, marginBottom: 12, backgroundColor: '#FEE2E2', borderRadius: 8, padding: 10 }}>
                <Text style={{ color: '#B91C1C', fontSize: 13 }}>{errorMsg}</Text>
              </View>
            )}

            {/* Inline confirm step */}
            {pending ? (
              <View style={{ paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: su.border }}>
                <Text style={{ color: su.text, fontSize: 15, fontWeight: '600', marginBottom: 6 }}>
                  {pending.hours === null
                    ? 'Delete ALL log entries?'
                    : `Delete logs older than ${pending.label.toLowerCase()}?`}
                </Text>
                <Text style={{ color: su.textMuted, fontSize: 13, marginBottom: 20 }}>
                  This cannot be undone.
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable
                    onPress={() => setPending(null)}
                    style={({ pressed }) => ({
                      flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
                      backgroundColor: pressed ? su.surfaceAlt : su.surfaceAlt,
                      borderWidth: 1, borderColor: su.border,
                    })}
                  >
                    <Text style={{ color: su.text, fontWeight: '600', fontSize: 14 }}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => executeClear(pending)}
                    disabled={clearing}
                    style={({ pressed }) => ({
                      flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
                      backgroundColor: pressed || clearing ? '#DC2626' : su.danger,
                      opacity: clearing ? 0.7 : 1,
                    })}
                  >
                    {clearing
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Clear</Text>
                    }
                  </Pressable>
                </View>
              </View>
            ) : (
              CLEAR_OPTIONS.map((opt, i) => {
                const isLast = i === CLEAR_OPTIONS.length - 1;
                return (
                  <Pressable
                    key={String(opt.hours)}
                    onPress={() => setPending(opt)}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 20,
                      paddingVertical: 15,
                      backgroundColor: pressed ? su.surfaceAlt : 'transparent',
                      borderTopWidth: 1,
                      borderTopColor: su.border,
                      ...(isLast ? { borderBottomWidth: 1, borderBottomColor: su.border } : {}),
                    })}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{
                        color: isLast ? su.danger : su.text,
                        fontSize: 15,
                        fontWeight: isLast ? '600' : '400',
                      }}>
                        {opt.label}
                      </Text>
                      <Text style={{ color: su.textSubtle, fontSize: 12, marginTop: 2 }}>{opt.desc}</Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={isLast ? su.danger : su.textSubtle}
                    />
                  </Pressable>
                );
              })
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────

const TABS = ['Platform audit', 'API logs', 'Errors'] as const;
type Tab = typeof TABS[number];

export default function SuperuserLogsScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 800;

  const [activeTab, setActiveTab] = useState<Tab>('Platform audit');

  // Audit log state
  const [auditLogs,    setAuditLogs]    = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // API log state
  const [apiLogs,    setApiLogs]    = useState<ApiLogEntry[]>([]);
  const [apiLoading, setApiLoading] = useState(false);
  const [methodFilter, setMethodFilter] = useState<string>('ALL');

  // Clear sheet
  const [showClear, setShowClear] = useState(false);
  const [lastCleared, setLastCleared] = useState<{ count: number; at: Date } | null>(null);

  useEffect(() => {
    if (activeTab === 'Platform audit') loadAudit();
    if (activeTab === 'API logs')       loadApiLogs();
    if (activeTab === 'Errors')         loadApiLogs();
  }, [activeTab]);

  async function loadAudit() {
    setAuditLoading(true);
    const { data } = await supabase
      .from('superuser_audit_log')
      .select('*, profiles(first_name, last_name)')
      .order('created_at', { ascending: false })
      .limit(100);
    setAuditLogs((data as AuditEntry[]) ?? []);
    setAuditLoading(false);
  }

  async function loadApiLogs() {
    setApiLoading(true);
    const { data } = await supabase
      .from('api_request_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    setApiLogs((data as ApiLogEntry[]) ?? []);
    setApiLoading(false);
  }

  // ── derived data ──
  const filteredApiLogs = apiLogs.filter(e => {
    if (activeTab === 'Errors' && e.status !== 'error') return false;
    if (methodFilter !== 'ALL' && e.method !== methodFilter) return false;
    return true;
  });

  // Group by domain (for API logs tab)
  const byDomain = DOMAIN_ORDER.reduce<Record<string, ApiLogEntry[]>>((acc, d) => {
    const rows = filteredApiLogs.filter(e => e.domain === d);
    if (rows.length > 0) acc[d] = rows;
    return acc;
  }, {});

  // Catch any domain not in DOMAIN_ORDER
  filteredApiLogs.forEach(e => {
    if (!byDomain[e.domain]) byDomain[e.domain] = [];
    if (!byDomain[e.domain].includes(e)) byDomain[e.domain].push(e);
  });

  return (
    <View style={{ flex: 1, backgroundColor: su.bg }}>
      {/* ── Header ── */}
      <View style={{ paddingHorizontal: isWide ? 32 : 16, paddingTop: isWide ? 32 : 20, paddingBottom: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
          <Text style={{ color: su.text, fontSize: 26, fontWeight: '700', flex: 1 }}>Logs & Audit</Text>

          {/* Clear — only shown on API tabs */}
          {activeTab !== 'Platform audit' && (
            <Pressable
              onPress={() => setShowClear(true)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: su.danger + '55',
                marginRight: 8,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Ionicons name="trash-outline" size={14} color={su.danger} />
              <Text style={{ color: su.danger, fontSize: 13, fontWeight: '500' }}>Clear</Text>
            </Pressable>
          )}

          {/* Refresh */}
          <Pressable
            onPress={() => { if (activeTab === 'Platform audit') loadAudit(); else loadApiLogs(); }}
            style={({ pressed }) => ({
              padding: 8,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: su.border,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Ionicons name="refresh-outline" size={16} color={su.textMuted} />
          </Pressable>
        </View>

        {/* Last cleared notice */}
        {lastCleared && (
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: su.success + '18',
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 8,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: su.success + '44',
          }}>
            <Ionicons name="checkmark-circle-outline" size={14} color={su.success} />
            <Text style={{ color: su.success, fontSize: 12 }}>
              Cleared {lastCleared.count} {lastCleared.count === 1 ? 'entry' : 'entries'} · {timeAgo(lastCleared.at.toISOString())}
            </Text>
            <Pressable onPress={() => setLastCleared(null)} style={{ marginLeft: 'auto' }}>
              <Ionicons name="close" size={14} color={su.success} />
            </Pressable>
          </View>
        )}

        {/* Tabs */}
        <View style={{ flexDirection: 'row', gap: 0 }}>
          {TABS.map(t => (
            <Pressable
              key={t}
              onPress={() => setActiveTab(t)}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderBottomWidth: 2,
                borderBottomColor: activeTab === t ? su.primary : 'transparent',
              }}
            >
              <Text style={{
                color: activeTab === t ? su.primary : su.textMuted,
                fontSize: 14,
                fontWeight: activeTab === t ? '600' : '400',
              }}>
                {t}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={{ height: 1, backgroundColor: su.border, marginHorizontal: isWide ? -32 : -16 }} />
      </View>

      {/* ── Platform audit tab ── */}
      {activeTab === 'Platform audit' && (
        auditLoading
          ? <ActivityIndicator color={su.primary} style={{ marginTop: 48 }} />
          : (
            <ScrollView contentContainerStyle={{ padding: isWide ? 32 : 16, paddingBottom: 60 }}>
              {auditLogs.length === 0
                ? <EmptyState message={'No superuser actions logged yet.\nActions performed in this dashboard will appear here.'} />
                : auditLogs.map(e => <AuditCard key={e.id} entry={e} />)
              }
            </ScrollView>
          )
      )}

      {/* ── API logs tab ── */}
      {activeTab === 'API logs' && (
        apiLoading
          ? <ActivityIndicator color={su.primary} style={{ marginTop: 48 }} />
          : (
            <ScrollView contentContainerStyle={{ padding: isWide ? 32 : 16, paddingBottom: 60 }}>
              <FilterBar
                methodFilter={methodFilter}
                onMethodChange={setMethodFilter}
                count={filteredApiLogs.length}
              />
              {filteredApiLogs.length === 0
                ? <EmptyState message={'No API calls logged yet.\nEndpoint activity will appear here as users interact with the app.'} />
                : Object.entries(byDomain).map(([domain, entries]) => (
                    <DomainSection key={domain} domain={domain} entries={entries} />
                  ))
              }
            </ScrollView>
          )
      )}

      {/* ── Errors tab ── */}
      {activeTab === 'Errors' && (
        apiLoading
          ? <ActivityIndicator color={su.primary} style={{ marginTop: 48 }} />
          : (
            <ScrollView contentContainerStyle={{ padding: isWide ? 32 : 16, paddingBottom: 60 }}>
              <FilterBar
                methodFilter={methodFilter}
                onMethodChange={setMethodFilter}
                count={filteredApiLogs.length}
              />
              {filteredApiLogs.length === 0
                ? <EmptyState message={'No errors logged.\nFailed API calls (4xx / 5xx) will appear here.'} />
                : filteredApiLogs.map(e => (
                    <View key={e.id} style={{ marginBottom: 6 }}>
                      {/* Domain label above each error */}
                      <Text style={{ color: su.textSubtle, fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4, paddingLeft: 2 }}>
                        {DOMAIN_LABELS[e.domain] ?? e.domain}
                      </Text>
                      <ApiLogRow entry={e} />
                    </View>
                  ))
              }
            </ScrollView>
          )
      )}
      {/* ── Clear sheet ── */}
      <ClearSheet
        visible={showClear}
        onClose={() => setShowClear(false)}
        onCleared={(count) => {
          setLastCleared({ count, at: new Date() });
          loadApiLogs();
        }}
      />
    </View>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 64 }}>
      <Ionicons name="document-text-outline" size={40} color={su.textSubtle} />
      <Text style={{ color: su.textMuted, fontSize: 14, textAlign: 'center', marginTop: 16, lineHeight: 22 }}>
        {message}
      </Text>
    </View>
  );
}
