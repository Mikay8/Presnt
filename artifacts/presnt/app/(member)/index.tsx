import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Button, Card, DonutChart, Text } from '@/components/ui';
import { useThemeStore } from '@/stores/themeStore';

// ─── Dummy data ───────────────────────────────────────────────────────────────

const USER = { name: 'Ana Reyes', initials: 'AR', orgName: 'Kappa Sigma', role: 'Member' };

const ANNOUNCEMENTS = [
  {
    id: 'a1',
    author:   'Chapter President',
    initials: 'CP',
    time:     '2h ago',
    title:    'Spring Retreat Update',
    body:     "Hey everyone! Just a quick reminder that our spring retreat is this weekend. Please make sure you've signed the waiver and packed for the weather.",
  },
  {
    id: 'a2',
    author:   'VP Events',
    initials: 'VE',
    time:     '1d ago',
    title:    'Philanthropy Event Tomorrow',
    body:     'We have our annual philanthropy event tomorrow at 3 PM at the community center. Attendance is mandatory — please reach out if you have any conflicts.',
  },
  {
    id: 'a3',
    author:   'Treasurer',
    initials: 'TR',
    time:     '3d ago',
    title:    'Dues Deadline — This Friday',
    body:     'Friendly reminder that dues are due this Friday. Members with outstanding balances will receive a follow-up from the executive board.',
  },
];

const UPCOMING = [
  { id: 'e4', month: 'MAY', day: '19', title: 'Risk Mgmt Training' },
  { id: 'e5', month: 'MAY', day: '23', title: 'Community Service' },
  { id: 'e6', month: 'MAY', day: '26', title: 'Social Event' },
];

const TODAY = new Date();
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const todayLabel = `${DAYS[TODAY.getDay()]} · ${MONTHS[TODAY.getMonth()]} ${TODAY.getDate()}`;

// ─── Sub-components ───────────────────────────────────────────────────────────

function AnnouncementCard({ item }: { item: typeof ANNOUNCEMENTS[number] }) {
  const { theme } = useThemeStore();
  return (
    <Card style={{ gap: 10 }}>
      <View style={styles.announcementHeader}>
        <View style={styles.announcementLeft}>
          <Avatar name={item.author} size="sm" />
          <View>
            <Text size="sm" weight="medium">{item.author}</Text>
            <Text size="xs" color={theme.colors.textMuted}>{item.title}</Text>
          </View>
        </View>
        <Text size="xs" color={theme.colors.textSubtle}>{item.time}</Text>
      </View>
      <Text size="sm" color={theme.colors.textMuted} style={{ lineHeight: 20 }}>
        {item.body}
      </Text>
    </Card>
  );
}

function SectionLabel({ children }: { children: string }) {
  const { theme } = useThemeStore();
  return (
    <Text
      size="xs"
      weight="medium"
      color={theme.colors.textMuted}
      style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}
    >
      {children}
    </Text>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MemberHomeScreen() {
  const { theme }  = useThemeStore();
  const { width }  = useWindowDimensions();
  const insets     = useSafeAreaInsets();
  const isWide     = width >= 800;

  const announcementsList = (
    <View style={{ gap: 12 }}>
      {ANNOUNCEMENTS.map((item) => (
        <AnnouncementCard key={item.id} item={item} />
      ))}
    </View>
  );

  // ── Desktop layout ──
  if (isWide) {
    return (
      <View style={[styles.wideRoot, { backgroundColor: theme.colors.background }]}>
        {/* Main content */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.wideMain}
          showsVerticalScrollIndicator={false}
        >
          {/* Title row */}
          <View style={styles.wideTitleRow}>
            <View>
              <Text size="h1" weight="bold">Welcome back, Ana</Text>
              <Text size="sm" color={theme.colors.textMuted} style={{ marginTop: 4 }}>
                {todayLabel}
              </Text>
            </View>
            <View style={styles.wideTitleActions}>
              <Button
                label="View calendar"
                variant="outline"
                size="sm"
                onPress={() => router.push('/(member)/calendar')}
              />
              <Button
                label="Submit excuse"
                size="sm"
                onPress={() => {}}
              />
            </View>
          </View>

          <SectionLabel>Announcements</SectionLabel>
          {announcementsList}
        </ScrollView>

        {/* Right sidebar */}
        <View style={[styles.rightPanel, { borderLeftColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
          {/* Attendance card */}
          <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 20 }}>
            <Text size="xs" weight="medium" color={theme.colors.textMuted} style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
              Attendance
            </Text>
            <DonutChart percent={87} size={120} strokeWidth={14} />
            <Text size="sm" color={theme.colors.textMuted} style={{ textAlign: 'center' }}>
              Spring 2026 · 9/10 meetings
            </Text>
          </Card>

          {/* Upcoming events */}
          <Card style={{ gap: 0, paddingVertical: 16 }}>
            <Text
              size="xs"
              weight="medium"
              color={theme.colors.textMuted}
              style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14, paddingHorizontal: 4 }}
            >
              Upcoming Events
            </Text>
            {UPCOMING.map((ev, i) => (
              <Pressable
                key={ev.id}
                style={[
                  styles.upcomingRow,
                  i < UPCOMING.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
                ]}
                onPress={() => router.push(`/(member)/event/${ev.id}` as any)}
              >
                <View style={[styles.upcomingDateChip, { backgroundColor: theme.colors.surfaceAlt }]}>
                  <Text size="xs" weight="bold" color={theme.colors.textMuted} style={{ textTransform: 'uppercase' }}>
                    {ev.month}
                  </Text>
                  <Text size="sm" weight="bold">{ev.day}</Text>
                </View>
                <Text size="sm" style={{ flex: 1 }}>{ev.title}</Text>
              </Pressable>
            ))}
          </Card>
        </View>
      </View>
    );
  }

  // ── Mobile layout ──
  return (
    <View style={[styles.mobileRoot, { backgroundColor: theme.colors.background }]}>
      {/* Mobile header */}
      <View style={[styles.mobileHeader, { paddingTop: insets.top + 12, borderBottomColor: theme.colors.border }]}>
        <Avatar name={USER.name} size="sm" />
        <View style={{ flex: 1 }}>
          <Text size="md" weight="medium">{USER.name}</Text>
          <Text size="xs" color={theme.colors.textMuted}>
            {USER.orgName} · {USER.role}
          </Text>
        </View>
        <Pressable
          style={[styles.bellBtn, { borderColor: theme.colors.border }]}
        >
          <Ionicons name="notifications-outline" size={18} color={theme.colors.text} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.mobileScroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <SectionLabel>Announcements</SectionLabel>
        {announcementsList}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Wide
  wideRoot:         { flex: 1, flexDirection: 'row' },
  wideMain:         { padding: 32, gap: 0 },
  wideTitleRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  wideTitleActions: { flexDirection: 'row', gap: 10 },
  rightPanel:       { width: 300, borderLeftWidth: 1, padding: 20, gap: 16 },

  upcomingRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 4 },
  upcomingDateChip: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  announcementHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  announcementLeft:   { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 },

  // Mobile
  mobileRoot:   { flex: 1 },
  mobileHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  bellBtn:      { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  mobileScroll: { padding: 16, gap: 0 },
});
