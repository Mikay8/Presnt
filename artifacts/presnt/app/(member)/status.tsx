import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, DonutChart, Text } from '@/components/ui';
import { useThemeStore } from '@/stores/themeStore';

// ─── Dummy data ───────────────────────────────────────────────────────────────

const ATTENDANCE_PCT = 87;
const SEMESTER_LABEL = 'Spring 2026';
const WEEKS_REMAINING = 6;

const STAT_CARDS = [
  { label: 'Meetings',     value: '9/10',  pct: 90,  unit: '' },
  { label: 'Philanthropy', value: '8h',    pct: 80,  unit: 'hrs' },
  { label: 'Study Hrs',   value: '12h',   pct: 60,  unit: 'hrs' },
  { label: 'Socials',     value: '5/6',   pct: 83,  unit: '' },
];

const HISTORY = [
  { id: 'h1', title: 'Chapter Meeting',    subtitle: 'May 10 · 7 PM', attended: true  },
  { id: 'h2', title: 'Philanthropy Event', subtitle: 'Apr 22 · 3 PM', attended: false },
  { id: 'h3', title: 'Risk Mgmt Training', subtitle: 'Apr 14 · 6 PM', attended: true  },
  { id: 'h4', title: 'Community Service',  subtitle: 'Apr 8 · 10 AM', attended: true  },
  { id: 'h5', title: 'Social Event',       subtitle: 'Apr 1 · 7 PM',  attended: true  },
  { id: 'h6', title: 'Study Session',      subtitle: 'Mar 25 · 5 PM', attended: false },
  { id: 'h7', title: 'Chapter Meeting',    subtitle: 'Mar 17 · 7 PM', attended: true  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, pct }: { label: string; value: string; pct: number }) {
  const { theme } = useThemeStore();
  return (
    <Card style={styles.statCard}>
      <Text
        size="xs"
        weight="medium"
        color={theme.colors.textMuted}
        style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}
      >
        {label}
      </Text>
      <Text size="xxl" weight="bold" style={{ marginBottom: 8 }}>{value}</Text>
      {/* Progress bar */}
      <View style={[styles.barTrack, { backgroundColor: theme.colors.surfaceAlt }]}>
        <View
          style={[
            styles.barFill,
            { width: `${pct}%` as any, backgroundColor: theme.colors.primary },
          ]}
        />
      </View>
    </Card>
  );
}

function HistoryRow({
  item,
  isLast,
}: {
  item: typeof HISTORY[number];
  isLast: boolean;
}) {
  const { theme } = useThemeStore();
  return (
    <View
      style={[
        styles.historyRow,
        !isLast && { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text size="sm" weight="medium">{item.title}</Text>
        <Text size="xs" color={theme.colors.textMuted}>{item.subtitle}</Text>
      </View>
      <View
        style={[
          styles.attendedDot,
          { backgroundColor: item.attended ? theme.colors.primary : theme.colors.textSubtle },
        ]}
      />
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function StatusScreen() {
  const { theme } = useThemeStore();
  const { width } = useWindowDimensions();
  const insets    = useSafeAreaInsets();
  const isWide    = width >= 800;

  // ── Desktop ──
  if (isWide) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.widePad}
        showsVerticalScrollIndicator={false}
      >
        {/* Title row */}
        <View style={styles.wideTitleRow}>
          <View>
            <Text size="h1" weight="bold">Status</Text>
            <Text size="sm" color={theme.colors.textMuted} style={{ marginTop: 4 }}>
              {SEMESTER_LABEL} · {WEEKS_REMAINING} weeks remaining
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label="History"       variant="outline" size="sm" onPress={() => {}} />
            <Button label="Submit excuse" size="sm"         onPress={() => {}} />
          </View>
        </View>

        {/* Content row */}
        <View style={styles.wideContent}>
          {/* Left: donut */}
          <Card style={[styles.donutCard, { alignItems: 'center', gap: 16 }]}>
            <Text
              size="xs"
              weight="medium"
              color={theme.colors.textMuted}
              style={{ textTransform: 'uppercase', letterSpacing: 1 }}
            >
              Current
            </Text>
            <DonutChart
              percent={ATTENDANCE_PCT}
              size={200}
              strokeWidth={22}
              sublabel={SEMESTER_LABEL}
            />
            <Text size="sm" color={theme.colors.textMuted}>
              9 of 10 meetings attended
            </Text>
          </Card>

          {/* Right: stat cards + history */}
          <View style={{ flex: 1, gap: 16 }}>
            {/* Stat cards row */}
            <View style={styles.statRow}>
              {STAT_CARDS.map((s) => (
                <StatCard key={s.label} label={s.label} value={s.value} pct={s.pct} />
              ))}
            </View>

            {/* History list */}
            <Card style={{ paddingVertical: 8 }}>
              <View style={styles.historyHeader}>
                <Text
                  size="xs"
                  weight="medium"
                  color={theme.colors.textMuted}
                  style={{ textTransform: 'uppercase', letterSpacing: 1 }}
                >
                  Event History
                </Text>
                <Text size="xs" color={theme.colors.primary}>View all</Text>
              </View>
              {HISTORY.map((item, i) => (
                <HistoryRow key={item.id} item={item} isLast={i === HISTORY.length - 1} />
              ))}
            </Card>
          </View>
        </View>
      </ScrollView>
    );
  }

  // ── Mobile ──
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={[
        styles.mobilePad,
        { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.mobileTitleRow}>
        <Text size="h1" weight="bold">Status</Text>
        <Button label="Submit excuse" size="sm" onPress={() => {}} />
      </View>

      {/* Donut */}
      <View style={styles.mobileDonut}>
        <DonutChart percent={ATTENDANCE_PCT} size={180} strokeWidth={20} />
        <Text size="sm" color={theme.colors.textMuted} style={{ marginTop: 12, textAlign: 'center' }}>
          9 of 10 meetings attended · {SEMESTER_LABEL}
        </Text>
      </View>

      {/* Mini stat cards (3-up, horizontally scrollable) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingBottom: 4 }}
        style={{ marginHorizontal: -16, paddingHorizontal: 16 }}
      >
        {STAT_CARDS.slice(0, 3).map((s) => (
          <Card key={s.label} style={styles.miniStatCard}>
            <Text size="xs" color={theme.colors.textMuted} style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              {s.label}
            </Text>
            <Text size="xl" weight="bold">{s.value}</Text>
            <View style={[styles.barTrack, { backgroundColor: theme.colors.surfaceAlt, marginTop: 8 }]}>
              <View
                style={[
                  styles.barFill,
                  { width: `${s.pct}%` as any, backgroundColor: theme.colors.primary },
                ]}
              />
            </View>
          </Card>
        ))}
      </ScrollView>

      {/* History */}
      <Text
        size="xs"
        weight="medium"
        color={theme.colors.textMuted}
        style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: 24, marginBottom: 12 }}
      >
        History
      </Text>
      <Card style={{ paddingVertical: 4 }}>
        {HISTORY.map((item, i) => (
          <HistoryRow key={item.id} item={item} isLast={i === HISTORY.length - 1} />
        ))}
      </Card>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Wide
  widePad:      { padding: 32 },
  wideTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  wideContent:  { flexDirection: 'row', gap: 20, alignItems: 'flex-start' },
  donutCard:    { width: 280, paddingVertical: 28 },
  statRow:      { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  historyHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, paddingBottom: 10, borderBottomWidth: 1 },

  // Mobile
  mobilePad:      { paddingHorizontal: 16 },
  mobileTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  mobileDonut:    { alignItems: 'center', marginBottom: 24 },
  miniStatCard:   { width: 140, paddingVertical: 16 },

  // Shared
  statCard:    { flex: 1, minWidth: 120 },
  barTrack:    { height: 4, borderRadius: 2, overflow: 'hidden' },
  barFill:     { height: '100%', borderRadius: 2 },
  historyRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, gap: 12 },
  attendedDot: { width: 12, height: 12, borderRadius: 6 },
});
