/**
 * Standalone superuser login — http://localhost:8081/admin
 *
 * - No layout wrapping, no pre-existing session required.
 * - Calls Supabase auth directly, checks is_superuser, then
 *   redirects to the dashboard on success.
 * - If you already have a valid superuser session, auto-redirects.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';

// ─── Design tokens (self-contained, no import from layout needed) ─────────────
const su = {
  bg:         '#1C1411',
  surface:    '#272018',
  surfaceAlt: '#332820',
  text:       '#FBF6EE',
  textMuted:  '#A89687',
  textSubtle: '#6E5E54',
  border:     '#3D2B22',
  primary:    '#E26B4A',
  danger:     '#C0392B',
};

export default function AdminLogin() {
  const insets = useSafeAreaInsets();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(true);   // start true for auto-redirect check
  const [error, setError]       = useState<string | null>(null);
  const [showPass, setShowPass] = useState(false);

  // ── If already logged in as superuser, skip the form ──────────────────────
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_superuser')
        .eq('id', session.user.id)
        .single();

      if (profile?.is_superuser) {
        router.replace('/(superuser)');
      } else {
        setLoading(false);
      }
    })();
  }, []);

  // ── Login handler ──────────────────────────────────────────────────────────
  async function handleLogin() {
    setError(null);
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }

    setLoading(true);

    // 1 — Authenticate with Supabase
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

    if (authError || !authData.session) {
      setError(authError?.message ?? 'Sign-in failed. Check your credentials.');
      setLoading(false);
      return;
    }

    // 2 — Verify superuser flag
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_superuser')
      .eq('id', authData.session.user.id)
      .single();

    if (!profile?.is_superuser) {
      await supabase.auth.signOut();
      setError('This account does not have platform access.');
      setLoading(false);
      return;
    }

    // 3 — All good — go to dashboard
    router.replace('/(superuser)');
  }

  // ── Initial session check spinner ──────────────────────────────────────────
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: su.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={su.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: su.bg }}
    >
      <View style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
        paddingTop: insets.top,
        paddingBottom: insets.bottom + 24,
      }}>

        {/* Logo mark */}
        <View style={{ alignItems: 'center', marginBottom: 40 }}>
          <View style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            backgroundColor: su.primary,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
          }}>
            <Ionicons name="checkmark" size={30} color="#fff" />
          </View>
          <Text style={{ color: su.text, fontSize: 22, fontWeight: '700' }}>presnt</Text>
          <Text style={{
            color: su.textSubtle,
            fontSize: 10,
            letterSpacing: 2,
            textTransform: 'uppercase',
            marginTop: 4,
          }}>
            PLATFORM ACCESS
          </Text>
        </View>

        {/* Login card */}
        <View style={{
          width: '100%',
          maxWidth: 400,
          backgroundColor: su.surface,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: su.border,
          padding: 28,
        }}>
          <Text style={{ color: su.text, fontSize: 18, fontWeight: '700', marginBottom: 6 }}>
            Admin sign in
          </Text>
          <Text style={{ color: su.textMuted, fontSize: 13, marginBottom: 24, lineHeight: 20 }}>
            Superuser credentials required.{'\n'}
            Unauthorised access attempts are logged.
          </Text>

          {/* Email field */}
          <Text style={{
            color: su.textMuted,
            fontSize: 11,
            letterSpacing: 1,
            textTransform: 'uppercase',
            marginBottom: 8,
          }}>
            Email
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            placeholder="you@example.com"
            placeholderTextColor={su.textSubtle}
            style={{
              backgroundColor: su.surfaceAlt,
              borderWidth: 1,
              borderColor: su.border,
              borderRadius: 10,
              paddingHorizontal: 14,
              paddingVertical: 12,
              color: su.text,
              fontSize: 15,
              marginBottom: 18,
              // @ts-ignore — web only
              outline: 'none',
            }}
          />

          {/* Password field */}
          <Text style={{
            color: su.textMuted,
            fontSize: 11,
            letterSpacing: 1,
            textTransform: 'uppercase',
            marginBottom: 8,
          }}>
            Password
          </Text>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: su.surfaceAlt,
            borderWidth: 1,
            borderColor: su.border,
            borderRadius: 10,
            paddingHorizontal: 14,
            marginBottom: 24,
          }}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
              autoComplete="current-password"
              placeholder="••••••••"
              placeholderTextColor={su.textSubtle}
              style={{
                flex: 1,
                paddingVertical: 12,
                color: su.text,
                fontSize: 15,
                // @ts-ignore — web only
                outline: 'none',
              }}
            />
            <Pressable onPress={() => setShowPass((v) => !v)} style={{ padding: 4 }}>
              <Ionicons
                name={showPass ? 'eye-off-outline' : 'eye-outline'}
                size={18}
                color={su.textSubtle}
              />
            </Pressable>
          </View>

          {/* Error banner */}
          {error && (
            <View style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 8,
              backgroundColor: `${su.danger}22`,
              borderWidth: 1,
              borderColor: `${su.danger}55`,
              borderRadius: 8,
              padding: 12,
              marginBottom: 18,
            }}>
              <Ionicons
                name="alert-circle-outline"
                size={16}
                color={su.danger}
                style={{ marginTop: 1 }}
              />
              <Text style={{ color: su.danger, fontSize: 13, flex: 1, lineHeight: 20 }}>
                {error}
              </Text>
            </View>
          )}

          {/* Sign in button */}
          <Pressable
            onPress={handleLogin}
            disabled={loading}
            style={({ pressed }) => ({
              backgroundColor: pressed ? su.primary + 'cc' : su.primary,
              borderRadius: 10,
              paddingVertical: 14,
              alignItems: 'center',
            })}
          >
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>
              Sign in
            </Text>
          </Pressable>
        </View>

        {/* Footer disclaimer */}
        <Text style={{
          color: su.textSubtle,
          fontSize: 11,
          marginTop: 28,
          textAlign: 'center',
          lineHeight: 18,
        }}>
          This portal is for Presnt platform administrators only.{'\n'}
          All activity is monitored and logged.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
