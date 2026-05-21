import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Button, Card, Text } from '@/components/ui';
import { useThemeStore } from '@/stores/themeStore';

// ─── Event data ───────────────────────────────────────────────────────────────

interface EventDetail {
  id:          string;
  title:       string;
  subtitle?:   string;
  date:        string;
  time:        string;
  place:       string;
  type:        'Mandatory' | 'Social' | 'Optional';
  about:       string;
  going:       string[];   // initials
  goingCount:  number;
}

const EVENT_DATA: Record<string, EventDetail> = {
  e1: {
    id:         'e1',
    title:      'Chapter Meeting',
    subtitle:   'Weekly chapter business',
    date:       'May 10',
    time:       '7:00 PM',
    place:      'Chapter House',
    type:       'Mandatory',
    about:      'Our weekly chapter meeting will cover semester updates, committee reports, and upcoming event planning. All members are expected to attend. Please review the agenda sent to your email before the meeting.',
    going:      ['AR', 'JK', 'TM', 'LP', 'BW'],
    goingCount: 34,
  },
  e2: {
    id:         'e2',
    title:      'Philanthropy Event',
    subtitle:   'Annual charity drive',
    date:       'May 13',
    time:       '3:00 PM',
    place:      'Community Center',
    type:       'Mandatory',
    about:      'Join us for our annual philanthropy event at the local community center. We will be volunteering, fundraising, and representing our chapter. Please wear the provided shirts and arrive 15 minutes early for orientation.',
    going:      ['AR', 'JK', 'TM', 'LP', 'BW'],
    goingCount: 28,
  },
  e3: {
    id:         'e3',
    title:      'Spring Formal',
    subtitle:   'Annual spring banquet',
    date:       'May 17',
    time:       '8:00 PM',
    place:      'Grand Ballroom',
    type:       'Social',
    about:      "Our spring formal is the event of the semester! Dress code is semi-formal. Tickets are $30 per person and include dinner. Bring a guest if you'd like -- just make sure to register them in advance.",
    going:      ['AR', 'JK', 'TM', 'LP', 'BW'],
    goingCount: 62,
  },
  e4: {
    id:         'e4',
    title:      'Risk Mgmt Training',
    subtitle:   'Required safety training',
    date:       'May 19',
    time:       '6:00 PM',
    place:      'Chapter House',
    type:       'Mandatory',
    about:      'All active members must complete the annual risk management training. This session covers chapter policies, alcohol safety, hazing prevention, and emergency protocols. Completion is required for standing membership.',
    going:      ['AR', 'JK', 'TM', 'LP', 'BW'],
    goingCount: 41,
  },
  e5: {
    id:         'e5',
    title:      'Community Service',
    subtitle:   'Neighborhood cleanup',
    date:       'May 23',
    time:       '10:00 AM',
    place:      'Campus Grounds',
    type:       'Optional',
    about:      "Join us for a morning of giving back! We'll be cleaning up the campus grounds and nearby park. Wear comfortable clothes and bring water. This counts toward your community service hours for the semester.",
    going:      ['AR', 'JK', 'TM'],
    goingCount: 18,
  },
  e6: {
    id:         'e6',
    title:      'Social Event',
    subtitle:   'End-of-semester mixer',
    date:       'May 26',
    time:       '7:00 PM',
    place:      'Chapter House',
    type:       'Social',
    about:      "Come celebrate the end of another great semester with your brothers and their guests. We'll have food, games, and music. Casual dress. Bring a positive attitude!",
    going:      ['AR', 'JK', 'TM', 'LP', 'BW'],
    goingCount: 55,
  },
  e7: {
    id:         'e7',
    title:      'End of Year Banquet',
    subtitle:   'Celebrating the year',
    date:       'June 2',
    time:       '6:30 PM',
    place:      'Alumni Hall',
    type:       'Mandatory',
    about:      'Our end-of-year banquet recognizes outstanding brothers, outgoing officers, and our senior class. Attire is formal. Dinner is provided. This is one of our most important events of the year — plan accordingly.',
    going:      ['AR', 'JK', 'TM', 'LP', 'BW'],
    goingCount: 72,
  },
};

const TYPE_COLOR: Record<string, string> = {
  Mandatory: '#E26B4A',
  Social:    '#A855F7',
  Optional:  '#22C55E',
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function EventDetailScreen() {
  const { id }    = useLocalSearchParams<{ id: string }>();
  const { theme } = useThemeStore();
  const { width } = useWindowDimensions();
  const insets    = useSafeAreaInsets();
  const isWide    = width >= 800;

  const event = id ? EVENT_DATA[id] : null;

  if (!event) {
    return (
      <View style={[styles.notFound, { backgroundColor: theme.colors.background }]}>
        <Text size="lg" weight="bold">Event not found</Text>
        <Pressable onPress={() => router.back()}>
          <Text size="md" color={theme.colors.primary}>← Go back</Text>
        </Pressable>
      </View>
    );
  }

  const typeColor = TYPE_COLOR[event.type] ?? theme.colors.primary;
  const extraGoers = event.goingCount - event.going.length;

  // ── Info chips ──
  const chips = (
    <View style={styles.chips}>
      {[
        event.date,
        event.time,
        event.place,
        event.type,
      ].map((chip) => (
        <View
          key={chip}
          style={[
            styles.chip,
            {
              backgroundColor: chip === event.type ? typeColor + '20' : theme.colors.surfaceAlt,
              borderColor:     chip === event.type ? typeColor : theme.colors.border,
            },
          ]}
        >
          <Text
            size="sm"
            weight={chip === event.type ? 'medium' : 'regular'}
            color={chip === event.type ? typeColor : theme.colors.text}
          >
            {chip}
          </Text>
        </View>
      ))}
    </View>
  );

  // ── Going avatars ──
  const goingSection = (
    <View>
      <Text
        size="xs"
        weight="medium"
        color={theme.colors.textMuted}
        style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}
      >
        Going ({event.goingCount})
      </Text>
      <View style={styles.avatarRow}>
        {event.going.map((initials, i) => (
          <View
            key={i}
            style={[
              styles.goingAvatar,
              {
                backgroundColor: theme.colors.surfaceAlt,
                borderColor:     theme.colors.border,
                marginLeft:      i === 0 ? 0 : -10,
              },
            ]}
          >
            <Text size="xs" weight="medium" color={theme.colors.textMuted}>{initials}</Text>
          </View>
        ))}
        {extraGoers > 0 && (
          <View
            style={[
              styles.goingAvatar,
              {
                backgroundColor: theme.colors.surfaceAlt,
                borderColor:     theme.colors.border,
                marginLeft:      -10,
              },
            ]}
          >
            <Text size="xs" color={theme.colors.textMuted}>+{extraGoers}</Text>
          </View>
        )}
      </View>
    </View>
  );

  // ── Event banner ──
  const banner = (
    <View style={[styles.banner, { backgroundColor: theme.colors.surfaceAlt }]}>
      <Ionicons name="calendar-outline" size={40} color={theme.colors.textSubtle} />
      <Text size="sm" color={theme.colors.textSubtle} style={{ marginTop: 8 }}>
        event banner
      </Text>
    </View>
  );

  // ── Desktop ──
  if (isWide) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.widePad}
        showsVerticalScrollIndicator={false}
      >
        {/* Top bar */}
        <View style={styles.wideTitleRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Pressable
              onPress={() => router.back()}
              style={[styles.backBtn, { borderColor: theme.colors.border }]}
            >
              <Ionicons name="arrow-back-outline" size={16} color={theme.colors.text} />
            </Pressable>
            <View>
              <Text size="xs" color={theme.colors.textMuted}>Calendar</Text>
              <Text size="lg" weight="bold">{event.title}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label="Share"    variant="outline" size="sm" onPress={() => {}} />
            <Button label="Check in" size="sm"         onPress={() => {}} />
          </View>
        </View>

        {/* Content row */}
        <View style={styles.wideContent}>
          {/* Left: banner + details */}
          <View style={{ flex: 1, gap: 20 }}>
            {banner}
            <Text size="xl" weight="bold">{event.title}</Text>
            {event.subtitle && (
              <Text size="md" color={theme.colors.textMuted} style={{ marginTop: -12 }}>
                {event.subtitle}
              </Text>
            )}
            {chips}
            <View>
              <Text
                size="xs"
                weight="medium"
                color={theme.colors.textMuted}
                style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}
              >
                About
              </Text>
              <Text size="md" color={theme.colors.textMuted} style={{ lineHeight: 24 }}>
                {event.about}
              </Text>
            </View>
          </View>

          {/* Right: going + QR */}
          <View style={styles.wideRightPanel}>
            <Card style={{ gap: 12 }}>
              {goingSection}
            </Card>

            <Card style={{ gap: 12 }}>
              <Text
                size="xs"
                weight="medium"
                color={theme.colors.textMuted}
                style={{ textTransform: 'uppercase', letterSpacing: 1 }}
              >
                Check-in
              </Text>
              <View style={[styles.qrBox, { backgroundColor: theme.colors.surfaceAlt }]}>
                <Ionicons name="qr-code-outline" size={48} color={theme.colors.textSubtle} />
                <Text size="sm" color={theme.colors.textSubtle} style={{ marginTop: 8 }}>
                  QR / check-in
                </Text>
              </View>
              <Text size="sm" color={theme.colors.textMuted} style={{ textAlign: 'center' }}>
                Present this code at the door
              </Text>
            </Card>
          </View>
        </View>
      </ScrollView>
    );
  }

  // ── Mobile ──
  return (
    <View style={[styles.mobileRoot, { backgroundColor: theme.colors.background }]}>
      {/* Top nav */}
      <View style={[styles.mobileTopNav, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backBtn, { borderColor: theme.colors.border }]}
        >
          <Ionicons name="arrow-back-outline" size={16} color={theme.colors.text} />
        </Pressable>
        <Pressable
          style={[styles.shareBtn, { borderColor: theme.colors.border }]}
          onPress={() => {}}
        >
          <Ionicons name="share-outline" size={16} color={theme.colors.text} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.mobilePad, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {banner}
        <Text size="xl" weight="bold" style={{ marginTop: 16 }}>{event.title}</Text>
        {event.subtitle && (
          <Text size="md" color={theme.colors.textMuted} style={{ marginTop: 4 }}>
            {event.subtitle}
          </Text>
        )}
        <View style={{ marginTop: 14 }}>{chips}</View>

        {/* About */}
        <Text
          size="xs"
          weight="medium"
          color={theme.colors.textMuted}
          style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: 20, marginBottom: 8 }}
        >
          About
        </Text>
        <Text size="md" color={theme.colors.textMuted} style={{ lineHeight: 24 }}>
          {event.about}
        </Text>

        {/* Going */}
        <View style={{ marginTop: 20 }}>{goingSection}</View>
      </ScrollView>

      {/* Bottom action bar */}
      <View
        style={[
          styles.mobileActionBar,
          {
            borderTopColor:   theme.colors.border,
            backgroundColor:  theme.colors.background,
            paddingBottom:    insets.bottom + 12,
          },
        ]}
      >
        <Button label="RSVP"    variant="outline" style={{ flex: 1 }} onPress={() => {}} />
        <Button label="Check in" style={{ flex: 1 }}                  onPress={() => {}} />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },

  // Wide
  widePad:       { padding: 32 },
  wideTitleRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  wideContent:   { flexDirection: 'row', gap: 24 },
  wideRightPanel:{ width: 280, gap: 16 },

  qrBox: { borderRadius: 12, height: 140, alignItems: 'center', justifyContent: 'center' },

  backBtn: { width: 36, height: 36, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  // Mobile
  mobileRoot:      { flex: 1 },
  mobileTopNav:    { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  shareBtn:        { width: 36, height: 36, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  mobilePad:       { paddingHorizontal: 16 },
  mobileActionBar: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },

  // Shared
  banner:    { height: 180, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  chips:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:      { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  avatarRow: { flexDirection: 'row', alignItems: 'center' },
  goingAvatar: {
    width:        36,
    height:       36,
    borderRadius: 18,
    borderWidth:  2,
    alignItems:   'center',
    justifyContent: 'center',
  },
});
