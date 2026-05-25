/**
 * DemoBanner
 *
 * Floats at the bottom of the screen whenever demo mode is active.
 * Shows "Demo · Admin" or "Demo · Member" label and an "Exit" button.
 *
 * Mirrors the UserViewBanner pattern in _layout.tsx.
 * The "Exit" button signs out of Supabase, calls stopDemo(), and redirects to login.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { useDemoStore } from '@/stores/demoStore';

export function DemoBanner() {
  const { isActive, role, stopDemo } = useDemoStore();
  const insets  = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide  = width >= 768;

  if (!isActive) return null;

  async function handleExit() {
    stopDemo();
    await supabase.auth.signOut();
    router.replace('/(auth)/login' as any);
  }

  const roleLabel = role === 'admin' ? 'Admin' : 'Member';

  // Lift above tab bar on mobile (same logic as UserViewBanner)
  const TAB_BAR_HEIGHT = isWide ? 0 : 49;
  const bottomOffset = insets.bottom + 12 + TAB_BAR_HEIGHT;

  return (
    <View style={{
      position:          'absolute',
      bottom:            bottomOffset,
      left:              16,
      right:             16,
      flexDirection:     'row',
      alignItems:        'center',
      backgroundColor:   '#0F172A',
      borderWidth:       1,
      borderColor:       '#6366F1',
      borderRadius:      12,
      paddingHorizontal: 16,
      paddingVertical:   12,
      gap:               10,
      shadowColor:       '#000',
      shadowOffset:      { width: 0, height: 4 },
      shadowOpacity:     0.4,
      shadowRadius:      8,
      elevation:         10,
    }}>
      {/* Pulse dot */}
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#6366F1' }} />

      <Ionicons name="eye-outline" size={16} color="#A5B4FC" />

      <View style={{ flex: 1 }}>
        <Text style={{ color: '#F1F5F9', fontSize: 13, fontWeight: '600' }}>
          Demo Mode — {roleLabel} View
        </Text>
        <Text style={{ color: '#94A3B8', fontSize: 11, marginTop: 1 }}>
          Read-only · No changes will be saved
        </Text>
      </View>

      <Pressable
        onPress={handleExit}
        style={({ pressed }) => ({
          backgroundColor: pressed ? '#6366F1' : '#6366F122',
          borderWidth:     1,
          borderColor:     '#6366F1',
          borderRadius:    8,
          paddingHorizontal: 12,
          paddingVertical: 6,
        })}
      >
        <Text style={{ color: '#A5B4FC', fontSize: 13, fontWeight: '600' }}>Exit</Text>
      </Pressable>
    </View>
  );
}
