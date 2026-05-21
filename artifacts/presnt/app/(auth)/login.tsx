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

export default function LoginScreen() {
  const theme = useThemeStore((s) => s.theme);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 800;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    setError('');
    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (authError) setError(authError.message);
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
          <Image source={require('@/assets/images/wordmark-dark.png')}
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
  formInnerWide:   { width: '100%', maxWidth: 480 },

  mobileContainer: { flex: 1 },
  mobileScroll:    { paddingHorizontal: 28, flexGrow: 1 },
  iconRow:         { alignItems: 'center', marginBottom: 32 },
  appIcon:         { width: 180, height: 40,},

  formInner:       { width: '100%' },
  heading:         { marginBottom: 6 },
  subheading:      { marginBottom: 28 },
  fields:          { gap: 16 },
  cta:             { marginTop: 4 },

  checkRow:        { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox:        { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },

  dividerRow:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dividerLine:     { flex: 1, height: 1 },

  oauthRow:        { flexDirection: 'row', gap: 10 },
  googleBtn:       { flex: 1 },
  ssoBtn:          { width: 80 },

  footer:          { flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
});
