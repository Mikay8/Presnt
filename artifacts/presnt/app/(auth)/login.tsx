import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import React, { useState } from 'react';
import { Image, StyleSheet, TouchableOpacity, View } from 'react-native';

import { Button, Input, ScreenContainer, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useThemeStore } from '@/stores/themeStore';

export default function LoginScreen() {
  const theme = useThemeStore((s) => s.theme);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    setError('');
    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (authError) {
      setError(authError.message);
    }
    // On success, the auth state listener in _layout.tsx handles redirect
  }

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <View style={styles.logoRow}>
        <Image
          source={require('@/assets/images/wordmark-dark.svg')}
          style={styles.wordmark}
          resizeMode="contain"
        />
      </View>

      <Text size="h1" weight="semibold" style={styles.heading}>
        Welcome back
      </Text>
      <Text size="md" color={theme.colors.textMuted} style={styles.subheading}>
        Sign in to your chapter account
      </Text>

      <View style={styles.form}>
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />

        <Input
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          secureTextEntry={!showPassword}
          autoComplete="password"
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

        {error ? (
          <Text size="sm" color={theme.colors.error} style={styles.errorText}>
            {error}
          </Text>
        ) : null}

        <Button
          label="Sign in"
          onPress={handleLogin}
          loading={loading}
          style={styles.button}
        />
      </View>

      <View style={styles.footer}>
        <Text size="sm" color={theme.colors.textMuted}>
          Don't have an account?{' '}
        </Text>
        <Link href="/(auth)/register" asChild>
          <TouchableOpacity>
            <Text size="sm" color={theme.colors.primary} weight="medium">
              Sign up
            </Text>
          </TouchableOpacity>
        </Link>
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
  logoRow: {
    alignItems: 'center',
    marginBottom: 40,
  },
  wordmark: {
    width: 120,
    height: 36,
  },
  heading: {
    marginBottom: 8,
  },
  subheading: {
    marginBottom: 32,
  },
  form: {
    gap: 16,
  },
  errorText: {
    marginTop: -8,
  },
  button: {
    marginTop: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
  },
});
