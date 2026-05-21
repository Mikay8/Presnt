import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { useWindowDimensions, View } from 'react-native';

import { Sidebar, TopBar } from '@/components/ui';
import { useThemeStore } from '@/stores/themeStore';

export default function MemberLayout() {
  const { theme }  = useThemeStore();
  const { width }  = useWindowDimensions();
  const isWide     = width >= 800;

  const tabScreens = (
    <>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="status"
        options={{
          title: 'Status',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="checkmark-circle-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
      {/* hidden route — event detail navigated to from calendar */}
      <Tabs.Screen name="event/[id]" options={{ href: null }} />
    </>
  );

  if (isWide) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: theme.colors.background }}>
        <Sidebar />
        <View style={{ flex: 1 }}>
          <TopBar />
          <Tabs
            screenOptions={{
              headerShown: false,
              tabBarStyle: { display: 'none' },
            }}
          >
            {tabScreens}
          </Tabs>
        </View>
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor:  theme.colors.surface,
          borderTopColor:   theme.colors.border,
          borderTopWidth:   1,
        },
        tabBarActiveTintColor:   theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSubtle,
        tabBarLabelStyle: {
          fontFamily: theme.typography.fontFamily.medium,
          fontSize:   11,
        },
      }}
    >
      {tabScreens}
    </Tabs>
  );
}
