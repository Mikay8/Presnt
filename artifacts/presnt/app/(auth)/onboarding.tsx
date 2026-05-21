import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import {
  Image,
  ScrollView,
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
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Logo */}
      <View style={styles.logoRow}>
        <Image
          source={require('@/assets/images/icon-1024-light.png')}
          style={styles.logoIcon}
          resizeMode="contain"
        />
        <Text size="xl" weight="bold" color={theme.colors.text}>presnt</Text>
      </View>

      <Text size="h1" weight="bold" style={styles.heading}>Get started</Text>
      <Text size="md" color={theme.colors.textMuted} style={styles.subheading}>
        Are you starting a new organization, adding a chapter, or joining an existing one?
      </Text>

      {/* Cards */}
      <View style={[styles.cards, isWide && styles.cardsWide]}>
        {/* Create Organization card */}
        <View style={[
          styles.card,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.primary, borderWidth: 2 },
          isWide && styles.cardWide,
        ]}>
          <View style={[styles.cardIcon, { backgroundColor: theme.colors.primary + '22' }]}>
            <Ionicons name="globe-outline" size={32} color={theme.colors.primary} />
          </View>
          <Text size="lg" weight="bold" style={styles.cardTitle}>Create an organization</Text>
          <Text size="sm" color={theme.colors.textMuted} style={styles.cardDesc}>
            Start a new umbrella organization (e.g. a national fraternity or sorority) with chapters under it.
          </Text>
          <Button
            label="Create organization"
            onPress={() => router.push('/(auth)/create-org')}
            style={styles.cardBtn}
          />
        </View>

        {/* Create Chapter card */}
        <View style={[
          styles.card,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1 },
          isWide && styles.cardWide,
        ]}>
          <View style={[styles.cardIcon, { backgroundColor: theme.colors.surfaceAlt }]}>
            <Ionicons name="business-outline" size={32} color={theme.colors.textMuted} />
          </View>
          <Text size="lg" weight="bold" style={styles.cardTitle}>Create a chapter</Text>
          <Text size="sm" color={theme.colors.textMuted} style={styles.cardDesc}>
            Set up a standalone chapter or add a chapter under an existing organization.
          </Text>
          <Button
            label="Create a chapter"
            variant="outline"
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
          <View style={[styles.cardIcon, { backgroundColor: theme.colors.surfaceAlt }]}>
            <Ionicons name="enter-outline" size={32} color={theme.colors.textMuted} />
          </View>
          <Text size="lg" weight="bold" style={styles.cardTitle}>Join a chapter</Text>
          <Text size="sm" color={theme.colors.textMuted} style={styles.cardDesc}>
            Enter a join code or search for your chapter by name.
          </Text>
          <Button
            label="Join existing"
            variant="outline"
            onPress={() => router.push('/(auth)/join-chapter')}
            style={styles.cardBtn}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:   { flexGrow: 1, alignItems: 'center', paddingHorizontal: 24 },
  logoRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 32 },
  logoIcon:    { width: 36, height: 36, borderRadius: 8 },
  heading:     { textAlign: 'center', marginBottom: 8 },
  subheading:  { textAlign: 'center', marginBottom: 40, maxWidth: 480 },
  cards:       { width: '100%', maxWidth: 960, gap: 16 },
  cardsWide:   { flexDirection: 'row', alignItems: 'stretch' },
  card:        { flex: 1, borderRadius: 16, padding: 24, gap: 12 },
  cardWide:    {},
  cardIcon:    { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  cardTitle:   {},
  cardDesc:    { lineHeight: 20, flexGrow: 1 },
  cardBtn:     { marginTop: 8 },
});
