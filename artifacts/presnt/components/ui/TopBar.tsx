import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { Text } from './Text';

export function TopBar() {
  const { theme } = useThemeStore();
  const { profile, membership } = useAuthStore();

  const firstName = profile?.first_name ?? '';
  const lastName  = profile?.last_name  ?? '';
  // Display as "F. LastName" if both exist, otherwise fall back gracefully
  const userName  = firstName && lastName
    ? `${firstName[0]}. ${lastName}`
    : firstName || lastName || 'Member';

  const role = membership?.role
    ? membership.role.toUpperCase().replace('_', ' ')
    : 'MEMBER';

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor:  theme.colors.background,
          borderBottomColor: theme.colors.border,
        },
      ]}
    >
      {/* Search */}
      <View
        style={[
          styles.search,
          {
            backgroundColor: theme.colors.surface,
            borderColor:     theme.colors.border,
          },
        ]}
      >
        <Ionicons name="search-outline" size={15} color={theme.colors.textSubtle} />
        <TextInput
          placeholder="Search…"
          placeholderTextColor={theme.colors.textSubtle}
          style={[
            styles.searchInput,
            {
              fontFamily: theme.typography.fontFamily.regular,
              fontSize:   theme.typography.size.sm,
              color:      theme.colors.text,
              // @ts-ignore — web only
              outline: 'none',
            },
          ]}
        />
      </View>

      {/* Right: bell + avatar */}
      <View style={styles.actions}>
        <Pressable
          style={[styles.iconBtn, { borderColor: theme.colors.border }]}
        >
          <Ionicons name="notifications-outline" size={18} color={theme.colors.text} />
        </Pressable>

        <View style={styles.userRow}>
          <View
            style={[styles.avatar, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}
          >
            <Text size="xs" weight="medium" color={theme.colors.textMuted}>
              {firstName && lastName
                ? `${firstName[0]}${lastName[0]}`
                : (firstName[0] ?? '?')}
            </Text>
          </View>
          <View>
            <Text size="sm" weight="medium">{userName}</Text>
            <Text
              size="xs"
              color={theme.colors.textSubtle}
              style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}
            >
              {role}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingHorizontal: 24,
    paddingVertical:   12,
    gap:            16,
    borderBottomWidth: 1,
  },
  search: {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    gap:             8,
    paddingHorizontal: 14,
    paddingVertical:   9,
    borderRadius:    10,
    borderWidth:     1,
    maxWidth:        480,
  },
  searchInput: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
    marginLeft:    'auto',
  },
  iconBtn: {
    width:          36,
    height:         36,
    borderRadius:   18,
    borderWidth:    1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  userRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
  },
  avatar: {
    width:           36,
    height:          36,
    borderRadius:    18,
    borderWidth:     1,
    alignItems:      'center',
    justifyContent:  'center',
  },
});
