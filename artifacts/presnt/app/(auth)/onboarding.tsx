import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { Card, ScreenContainer, Text } from '@/components/ui';
import { useThemeStore } from '@/stores/themeStore';

export default function OnboardingScreen() {
  const theme = useThemeStore((s) => s.theme);

  return (
    <ScreenContainer contentStyle={styles.content}>
      <View style={styles.header}>
        <Text size="h1" weight="semibold" style={styles.heading}>
          Set up your chapter
        </Text>
        <Text size="md" color={theme.colors.textMuted} style={styles.subheading}>
          Are you starting a new chapter or joining an existing one?
        </Text>
      </View>

      <View style={styles.cards}>
        <TouchableOpacity onPress={() => router.push('/(auth)/create-chapter')} activeOpacity={0.85}>
          <Card style={styles.card} shadow="md">
            <View style={[styles.iconCircle, { backgroundColor: theme.colors.primary + '22' }]}>
              <Ionicons name="add-circle-outline" size={32} color={theme.colors.primary} />
            </View>
            <Text size="lg" weight="semibold" style={styles.cardTitle}>
              Create a chapter
            </Text>
            <Text size="sm" color={theme.colors.textMuted}>
              Start fresh. Set up your organization, branding, and invite your members.
            </Text>
          </Card>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push('/(auth)/join-chapter')} activeOpacity={0.85}>
          <Card style={styles.card} shadow="md">
            <View style={[styles.iconCircle, { backgroundColor: theme.colors.accent + '22' }]}>
              <Ionicons name="people-outline" size={32} color={theme.colors.accent} />
            </View>
            <Text size="lg" weight="semibold" style={styles.cardTitle}>
              Join a chapter
            </Text>
            <Text size="sm" color={theme.colors.textMuted}>
              Search for your chapter by name or code and request membership.
            </Text>
          </Card>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 40,
  },
  heading: {
    marginBottom: 8,
  },
  subheading: {
    lineHeight: 24,
  },
  cards: {
    gap: 16,
  },
  card: {
    padding: 24,
    gap: 12,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    marginBottom: 4,
  },
});
