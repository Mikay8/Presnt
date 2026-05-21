import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, useWindowDimensions, View } from 'react-native';

import { Text } from '@/components/ui';
import { su } from '../_layout';

const TOOLS = [
  { key: 'compliance',   icon: 'refresh-circle-outline' as const, label: 'Compliance recalculate', description: 'Trigger recalculation for a member or entire org' },
  { key: 'qr',          icon: 'qr-code-outline'         as const, label: 'QR inspector',           description: 'Look up any QR code and its scan history' },
  { key: 'push',        icon: 'notifications-outline'   as const, label: 'Push tester',            description: 'Send a test push notification to any device token' },
  { key: 'attendance',  icon: 'checkmark-circle-outline' as const, label: 'Attendance override',   description: 'Correct bad attendance records with audit trail' },
  { key: 'excuse',      icon: 'document-text-outline'   as const, label: 'Excuse override',        description: 'Approve or deny any excuse, bypassing officer review' },
];

// ─── QR Inspector ─────────────────────────────────────────────────────────────
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

// ─── Push tester ──────────────────────────────────────────────────────────────
function PushTester() {
  const [token, setToken]   = useState('');
  const [title, setTitle]   = useState('Test from Presnt HQ');
  const [body, setBody]     = useState('This is a test push notification.');

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

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function SuperuserSupportScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 800;
  const [active, setActive] = useState<string | null>(null);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: su.bg }} contentContainerStyle={{ padding: isWide ? 32 : 16, paddingBottom: 48 }}>
      <Text style={{ color: su.text, fontSize: 28, fontWeight: '700', marginBottom: 6 }}>Support tools</Text>
      <Text style={{ color: su.textMuted, fontSize: 13, marginBottom: 24 }}>Platform-level overrides and debug utilities</Text>

      <View style={{ gap: 12 }}>
        {TOOLS.map((tool) => (
          <View key={tool.key} style={{ backgroundColor: su.surface, borderRadius: 12, borderWidth: 1, borderColor: active === tool.key ? su.primary : su.border, overflow: 'hidden' }}>
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
              <View style={{ padding: 16, paddingTop: 0, borderTopWidth: 1, borderTopColor: su.border }}>
                {tool.key === 'qr'   && <QrInspector />}
                {tool.key === 'push' && <PushTester />}
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
