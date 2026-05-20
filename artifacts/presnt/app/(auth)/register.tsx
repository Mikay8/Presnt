import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { Button, Input, ScreenContainer, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useThemeStore } from '@/stores/themeStore';

export default function RegisterScreen() {
  const theme = useThemeStore((s) => s.theme);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleRegister() {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
      setError('All fields are required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setError('');
    setLoading(true);

    const { error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { first_name: firstName.trim(), last_name: lastName.trim() },
      },
    });

    setLoading(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    // Profile is auto-created by the DB trigger.
    // Redirect to onboarding to create/join a chapter.
    router.replace('/(auth)/onboarding');
  }

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
        <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
      </TouchableOpacity>

      <Text size="h1" weight="semibold" style={styles.heading}>
        Create account
      </Text>
      <Text size="md" color={theme.colors.textMuted} style={styles.subheading}>
        Set up your Presnt account
      </Text>

      <View style={styles.form}>
        <View style={styles.nameRow}>
          <View style={styles.nameField}>
            <Input
              label="First name"
              value={firstName}
              onChangeText={setFirstName}
              placeholder="Alex"
              autoCapitalize="words"
              autoComplete="given-name"
            />
          </View>
          <View style={styles.nameField}>
            <Input
              label="Last name"
              value={lastName}
              onChangeText={setLastName}
              placeholder="Smith"
              autoCapitalize="words"
              autoComplete="family-name"
            />
          </View>
        </View>

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
          placeholder="Min. 8 characters"
          secureTextEntry={!showPassword}
          autoComplete="new-password"
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
          label="Create account"
          onPress={handleRegister}
          loading={loading}
          style={styles.button}
        />
      </View>

      <View style={styles.footer}>
        <Text size="sm" color={theme.colors.textMuted}>
          Already have an account?{' '}
        </Text>
        <Link href="/(auth)/login" asChild>
          <TouchableOpacity>
            <Text size="sm" color={theme.colors.primary} weight="medium">
              Sign in
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
    paddingTop: 24,
    paddingBottom: 32,
  },
  backButton: {
    marginBottom: 24,
    alignSelf: 'flex-start',
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
  nameRow: {
    flexDirection: 'row',
    gap: 12,
  },
  nameField: {
    flex: 1,
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
