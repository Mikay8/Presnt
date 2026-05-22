import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
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
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';

function getStrength(pw: string): { score: number; label: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  if (/[A-Z]/.test(pw)) score++;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  return { score, label: labels[score] ?? '' };
}

const BAR_COLORS = ['#DC5A4A', '#E0B250', '#7BA776', '#7BA776'];

export default function RegisterScreen() {
  const theme = useThemeStore((s) => s.theme);
  const setSession = useAuthStore((s) => s.setSession);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 800;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { score, label: strengthLabel } = getStrength(password);

  async function handleRegister() {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
      setError('All fields are required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!agreedToTerms) {
      setError('Please agree to the Terms and Privacy Policy.');
      return;
    }
    setError('');
    setLoading(true);

    const { data: signUpData, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { first_name: firstName.trim(), last_name: lastName.trim() } },
    });

    setLoading(false);
    if (authError) { setError(authError.message); return; }

    if (!signUpData.session) {
      setError('Check your email for a confirmation link, then come back to sign in.');
      return;
    }

    setSession(signUpData.session);
    router.replace('/(auth)/onboarding');
  }

  const formContent = (
    <View style={[styles.formInner, isWide && styles.formInnerWide]}>
      <Text size="h1" weight="bold" style={styles.heading}>Create your account</Text>
      <Text size="md" color={theme.colors.textMuted} style={styles.subheading}>
        Takes about a minute · you can join or create a chapter next
      </Text>

      <View style={styles.fields}>
        {/* First / Last */}
        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Input label="First name" value={firstName} onChangeText={setFirstName}
              placeholder="Ana" autoCapitalize="words" autoComplete="given-name" />
          </View>
          <View style={{ flex: 1 }}>
            <Input label="Last name" value={lastName} onChangeText={setLastName}
              placeholder="Reyes" autoCapitalize="words" autoComplete="family-name" />
          </View>
        </View>

        {/* School email */}
        <Input
          label="School email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@gmail.com"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />

        {/* Password / Confirm side by side */}
        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="8+ characters"
              secureTextEntry={!showPassword}
              autoComplete="new-password"
              rightElement={
                <TouchableOpacity onPress={() => setShowPassword((v) => !v)}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={18} color={theme.colors.textMuted} />
                </TouchableOpacity>
              }
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              label="Confirm"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="••••••••"
              secureTextEntry={!showConfirm}
              autoComplete="new-password"
              rightElement={
                <TouchableOpacity onPress={() => setShowConfirm((v) => !v)}>
                  <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                    size={18} color={theme.colors.textMuted} />
                </TouchableOpacity>
              }
            />
          </View>
        </View>

        {/* Strength bars */}
        {password.length > 0 && (
          <View style={styles.strengthSection}>
            <View style={styles.strengthBars}>
              {[0, 1, 2, 3].map((i) => (
                <View
                  key={i}
                  style={[
                    styles.strengthBar,
                    { backgroundColor: i < score ? BAR_COLORS[score - 1] : theme.colors.border },
                  ]}
                />
              ))}
            </View>
            <Text size="xs" color={theme.colors.textMuted}>
              {strengthLabel} · 8 chars, number, symbol
            </Text>
          </View>
        )}

        {/* Terms checkbox */}
        <TouchableOpacity
          style={styles.checkRow}
          onPress={() => setAgreedToTerms((v) => !v)}
          activeOpacity={0.7}
        >
          <View style={[
            styles.checkbox,
            { borderColor: agreedToTerms ? theme.colors.primary : theme.colors.border },
            agreedToTerms && { backgroundColor: theme.colors.primary },
          ]}>
            {agreedToTerms && <Ionicons name="checkmark" size={11} color="#fff" />}
          </View>
          <Text size="sm" color={theme.colors.textMuted}>
            I agree to the{' '}
            <Text size="sm" color={theme.colors.primary} weight="medium">Terms</Text>
            {' '}and{' '}
            <Text size="sm" color={theme.colors.primary} weight="medium">Privacy Policy</Text>
          </Text>
        </TouchableOpacity>

        {error ? <Text size="sm" color={theme.colors.error}>{error}</Text> : null}

        <Button label="Create account" onPress={handleRegister} loading={loading} style={styles.cta} />
      </View>

      <View style={styles.footer}>
        <Text size="sm" color={theme.colors.textMuted}>Already have an account? </Text>
        <Link href="/(auth)/login" asChild>
          <TouchableOpacity>
            <Text size="sm" color={theme.colors.primary} weight="medium">Log in</Text>
          </TouchableOpacity>
        </Link>
      </View>
    </View>
  );

  if (isWide) {
    return (
      <View style={[styles.splitContainer, { backgroundColor: theme.colors.background }]}>
        <AuthLeftPanel />
        <ScrollView contentContainerStyle={styles.formPanel} showsVerticalScrollIndicator={false}>
          {formContent}
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.mobileContainer, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.mobileScroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.iconRow}>
          <Image source={require('@/assets/images/wordmark-light.png')}
            style={styles.appIcon} resizeMode="contain" />
        </View>
        {formContent}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  splitContainer:  { flex: 1, flexDirection: 'row' },
  formPanel:       { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 56 },
  formInnerWide:   { width: '100%', maxWidth: 540 },

  mobileContainer: { flex: 1 },
  mobileScroll:    { paddingHorizontal: 28, flexGrow: 1 },
  iconRow:         { alignItems: 'center', marginBottom: 32 },
  appIcon:         { width: 180, height: 40, },

  formInner:       { width: '100%' },
  heading:         { marginBottom: 6 },
  subheading:      { marginBottom: 28 },
  fields:          { gap: 16 },
  twoCol:          { flexDirection: 'row', gap: 12 },

  strengthSection: { gap: 6, marginTop: -4 },
  strengthBars:    { flexDirection: 'row', gap: 4 },
  strengthBar:     { flex: 1, height: 3, borderRadius: 2 },

  checkRow:        { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox:        { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  cta:             { marginTop: 4 },
  footer:          { flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
});
