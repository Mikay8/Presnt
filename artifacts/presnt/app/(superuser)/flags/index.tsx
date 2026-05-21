import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, ScrollView, Switch, useWindowDimensions, View } from 'react-native';

import { Text } from '@/components/ui';
import { su } from '../_layout';

// ─── Static flag definitions (will be DB-backed in future) ────────────────────
const DEFAULT_FLAGS = [
  { key: 'qr_checkin',          description: 'QR code check-in for events',            enabled: true,  plans: ['Pro', 'Council', 'HQ'] },
  { key: 'geofence_checkin',    description: 'GPS geofence check-in',                   enabled: true,  plans: ['Pro', 'Council', 'HQ'] },
  { key: 'push_notifications',  description: 'Push notification delivery',              enabled: true,  plans: ['Free', 'Pro', 'Council', 'HQ'] },
  { key: 'dues_tracking',       description: 'Dues management and payment tracking',    enabled: true,  plans: ['Pro', 'Council', 'HQ'] },
  { key: 'compliance_reports',  description: 'Compliance score reports and exports',    enabled: true,  plans: ['Pro', 'Council', 'HQ'] },
  { key: 'impersonation',       description: 'Superuser org impersonation',             enabled: true,  plans: [] },
  { key: 'email_templates',     description: 'Custom email notification templates',     enabled: false, plans: ['Council', 'HQ'] },
  { key: 'advanced_analytics',  description: 'Cohort and churn analytics dashboard',   enabled: false, plans: ['HQ'] },
];

export default function SuperuserFlagsScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 800;

  const [flags, setFlags] = useState(DEFAULT_FLAGS);

  function toggleFlag(key: string) {
    setFlags((prev) => prev.map((f) => f.key === key ? { ...f, enabled: !f.enabled } : f));
  }

  const enabledCount = flags.filter((f) => f.enabled).length;

  return (
    <View style={{ flex: 1, backgroundColor: su.bg }}>
      <View style={{ padding: isWide ? 32 : 16, paddingBottom: 0 }}>
        <Text style={{ color: su.text, fontSize: 28, fontWeight: '700' }}>Feature flags</Text>
        <Text style={{ color: su.textMuted, fontSize: 13, marginTop: 4, marginBottom: 24 }}>
          {flags.length} flags · {enabledCount} enabled globally
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: isWide ? 32 : 16, paddingBottom: 48 }}>
        <View style={{ gap: 8 }}>
          {flags.map((flag) => (
            <View
              key={flag.key}
              style={{ backgroundColor: su.surface, borderRadius: 12, borderWidth: 1, borderColor: su.border, padding: 16 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: su.text, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] as any }}>
                    {flag.key}
                  </Text>
                  <Text style={{ color: su.textMuted, fontSize: 12, marginTop: 4 }}>{flag.description}</Text>
                  {flag.plans.length > 0 && (
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                      {flag.plans.map((plan) => (
                        <View key={plan} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: su.surfaceAlt, borderWidth: 1, borderColor: su.border }}>
                          <Text style={{ color: su.textMuted, fontSize: 11 }}>{plan}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {flag.plans.length === 0 && (
                    <Text style={{ color: su.textSubtle, fontSize: 11, marginTop: 6 }}>Superuser only</Text>
                  )}
                </View>
                <Switch
                  value={flag.enabled}
                  onValueChange={() => toggleFlag(flag.key)}
                  trackColor={{ false: su.border, true: su.primary + '66' }}
                  thumbColor={flag.enabled ? su.primary : su.textSubtle}
                />
              </View>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 24, padding: 16, borderRadius: 10, backgroundColor: su.surfaceAlt, borderWidth: 1, borderColor: su.border }}>
          <Text style={{ color: su.textMuted, fontSize: 12, lineHeight: 20 }}>
            ⚠ Feature flags shown here are static stubs. Full DB-backed flag management with per-org overrides will be connected when the{' '}
            <Text style={{ color: su.primary }}>feature_flags</Text> table is added in a future migration.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
