import { router } from 'expo-router';
import React from 'react';
import {
  Image,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import { useThemeStore } from '@/stores/themeStore';

export default function OnboardingScreen() {
  const theme = useThemeStore((s) => s.theme);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 800;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 }]}>
      {/* Logo */}
      <View style={styles.logoRow}>
        <Image
          source={require('@/assets/images/icon-1024-light.png')}
          style={styles.logoIcon}
          resizeMode="contain"
        />
        <Text size="xl" weight="bold" color={theme.colors.text}>presnt</Text>
      </View>

      <Text size="h1" weight="bold" style={styles.heading}>Set up your chapter</Text>
      <Text size="md" color={theme.colors.textMuted} style={styles.subheading}>
        Are you starting a new chapter or joining an existing one?
      </Text>

      {/* Cards */}
      <View style={[styles.cards, isWide && styles.cardsWide]}>
        {/* Create card */}
        <View style={[
          styles.card,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.primary, borderWidth: 2 },
          isWide && styles.cardWide,
        ]}>
          <View style={[styles.cardImage, { backgroundColor: theme.colors.surfaceAlt }]}>
            <Text size="sm" color={theme.colors.textSubtle}>create</Text>
          </View>
          <Text size="lg" weight="bold" style={styles.cardTitle}>Create a chapter</Text>
          <Text size="sm" color={theme.colors.textMuted} style={styles.cardDesc}>
            Start fresh. Set up your organization, branding, and invite your members.
          </Text>
          <Button
            label="Create a chapter"
            onPress={() => router.push('/(auth)/create-chapter')}
            style={styles.cardBtn}
          />
        </View>

        {/* Join card */}
        <View style={[
          styles.card,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1 },
          isWide && styles.cardWide,
        ]}>
          <View style={[styles.cardImage, { backgroundColor: theme.colors.surfaceAlt }]}>
            <Text size="sm" color={theme.colors.textSubtle}>join</Text>
          </View>
          <Text size="lg" weight="bold" style={styles.cardTitle}>Join a chapter</Text>
          <Text size="sm" color={theme.colors.textMuted} style={styles.cardDesc}>
            Search for your chapter by name and request membership.
          </Text>
          <Button
            label="Join existing"
            variant="outline"
            onPress={() => router.push('/(auth)/join-chapter')}
            style={styles.cardBtn}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, alignItems: 'center', paddingHorizontal: 24 },
  logoRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 32 },
  logoIcon:    { width: 36, height: 36, borderRadius: 8 },
  heading:     { textAlign: 'center', marginBottom: 8 },
  subheading:  { textAlign: 'center', marginBottom: 40, maxWidth: 420 },
  cards:       { width: '100%', maxWidth: 880, gap: 16 },
  cardsWide:   { flexDirection: 'row' },
  card:        { flex: 1, borderRadius: 16, padding: 24, gap: 12 },
  cardWide:    {},
  cardImage:   { borderRadius: 12, height: 120, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  cardTitle:   {},
  cardDesc:    { lineHeight: 20, flexGrow: 1 },
  cardBtn:     { marginTop: 8 },
});
