import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import React, { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthLeftPanel, Button, Input, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useThemeStore } from '@/stores/themeStore';

const WEB_TOP    = 67;
const WEB_BOTTOM = 34;

export default function LoginScreen() {
  const theme = useThemeStore((s) => s.theme);
  const { colorScheme } = useThemeStore();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 800;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [unverified, setUnverified] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    setError('');
    setUnverified(false);
    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (authError) {
      if (
        authError.message.toLowerCase().includes('email not confirmed') ||
        authError.message.toLowerCase().includes('not confirmed')
      ) {
        setUnverified(true);
      } else {
        setError(authError.message);
      }
    }
  }

  async function handleResendVerification() {
    if (!email.trim()) {
      setError('Enter your email address above first.');
      return;
    }
    await supabase.auth.resend({ type: 'signup', email: email.trim() });
    setUnverified(false);
    setError('Verification email resent — check your inbox.');
  }

  const formContent = (
    <View style={[styles.formInner, isWide && styles.formInnerWide]}>
      <Text size="h1" weight="bold" style={styles.heading}>Welcome back</Text>
      <Text size="md" color={theme.colors.textMuted} style={styles.subheading}>
        Sign in to your chapter dashboard
      </Text>

      <View style={styles.fields}>
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@gmail.com"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />

        <Input
          label="Password"
          labelRight={
            <TouchableOpacity>
              <Text size="xs" color={theme.colors.primary} style={{ letterSpacing: 0 }}>
                Forgot?
              </Text>
            </TouchableOpacity>
          }
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          secureTextEntry={!showPassword}
          autoComplete="current-password"
          rightElement={
            <TouchableOpacity onPress={() => setShowPassword((v) => !v)}>
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={theme.colors.textMuted}
              />
            </TouchableOpacity>
          }
        />

        {error ? <Text size="sm" color={theme.colors.error}>{error}</Text> : null}

        {unverified && (
          <View style={[styles.unverifiedBox, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
            <Ionicons name="mail-outline" size={18} color="#B45309" style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text size="sm" weight="medium" style={{ color: '#92400E' }}>
                Please verify your email
              </Text>
              <Text size="xs" style={{ color: '#92400E', marginTop: 2 }}>
                Check your inbox for a confirmation link before signing in.
              </Text>
              <TouchableOpacity onPress={handleResendVerification} style={{ marginTop: 6 }}>
                <Text size="xs" weight="medium" style={{ color: '#B45309', textDecorationLine: 'underline' }}>
                  Resend verification email
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <Button label="Log in" onPress={handleLogin} loading={loading} style={styles.cta} />
      </View>

      <View style={styles.footer}>
        <Text size="sm" color={theme.colors.textMuted}>New to presnt? </Text>
        <Link href="/(auth)/register" asChild>
          <TouchableOpacity>
            <Text size="sm" color={theme.colors.primary} weight="medium">Create an account</Text>
          </TouchableOpacity>
        </Link>
      </View>

      <View style={styles.demoRow}>
        <Text size="sm" color={theme.colors.textMuted}>Want to explore first? </Text>
        <Link href="/(auth)/demo" asChild>
          <TouchableOpacity>
            <Text size="sm" color={theme.colors.primary} weight="medium">Try a demo</Text>
          </TouchableOpacity>
        </Link>
      </View>
    </View>
  );

  if (isWide) {
    return (
      <View style={[styles.splitContainer, { backgroundColor: theme.colors.background }]}>
        <AuthLeftPanel />
        <ScrollView
          contentContainerStyle={[
            styles.formPanel,
            Platform.OS === 'web' && { paddingTop: WEB_TOP + 56, paddingBottom: WEB_BOTTOM + 56 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {formContent}
        </ScrollView>
      </View>
    );
  }

  const topPad    = Platform.OS === 'web' ? WEB_TOP + 24    : insets.top + 24;
  const bottomPad = Platform.OS === 'web' ? WEB_BOTTOM + 32 : insets.bottom + 32;

  return (
    <KeyboardAvoidingView
      style={[styles.mobileContainer, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.mobileScroll, { paddingTop: topPad, paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.iconRow}>
          <Image
            source={
              colorScheme === 'dark'
                ? require('@/assets/images/wordmark-dark.png')
                : require('@/assets/images/wordmark-light.png')
            }
            style={styles.appIcon}
            resizeMode="contain"
          />
        </View>
        {formContent}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  splitContainer:  { flex: 1, flexDirection: 'row' },
  formPanel:       { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 56 },
  formInnerWide:   { width: '100%', maxWidth: 480 },

  mobileContainer: { flex: 1 },
  mobileScroll:    { paddingHorizontal: 28, flexGrow: 1 },
  iconRow:         { alignItems: 'center', marginBottom: 32 },
  appIcon:         { width: 180, height: 40 },

  formInner:       { width: '100%' },
  heading:         { marginBottom: 6 },
  subheading:      { marginBottom: 28 },
  fields:          { gap: 16 },
  cta:             { marginTop: 4 },

  footer:          { flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
  demoRow:         { flexDirection: 'row', justifyContent: 'center', marginTop: 12 },
  unverifiedBox:   { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 10, padding: 12, alignItems: 'flex-start' },
});
