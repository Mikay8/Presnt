/**
 * Invite / Join-via-link screen
 *
 * Reachable via:
 *   - Deep link:  presnt://invite?code=TEST-7114
 *   - Web URL:    https://www.presnt.link/(auth)/invite?code=TEST-7114
 *
 * Three scenarios:
 *   1. Not logged in  → show org welcome + register form (name/email/pw) that
 *      creates an account AND joins the chapter in one step.
 *   2. Logged in, no membership → show org welcome + "Join [Chapter]" confirm.
 *   3. Logged in, has membership → show "You're already in" message.
 *
 * The `code` URL param is required. If missing/invalid we show an error state.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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

import { Button, Input, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import type { Tables } from '@/types/database';

type Org = Tables<'organizations'>;

// ─── Password strength helper ─────────────────────────────────────────────────

function getStrength(pw: string): { score: number; label: string } {
  let score = 0;
  if (pw.length >= 8)            score++;
  if (/[0-9]/.test(pw))          score++;
  if (/[^a-zA-Z0-9]/.test(pw))  score++;
  if (/[A-Z]/.test(pw))          score++;
  return { score, label: ['', 'Weak', 'Fair', 'Good', 'Strong'][score] ?? '' };
}
const BAR_COLORS = ['#DC5A4A', '#E0B250', '#7BA776', '#7BA776'];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function InviteScreen() {
  const theme                       = useThemeStore((s) => s.theme);
  const { session, membership, user, setMembership } = useAuthStore();
  const insets                      = useSafeAreaInsets();
  const { width }                   = useWindowDimensions();
  const isWide                      = width >= 800;
  const c                           = theme.colors;

  const { code } = useLocalSearchParams<{ code?: string }>();

  // ── Org lookup ───────────────────────────────────────────────────────────────
  const [org,         setOrg]         = useState<Org | null>(null);
  const [loadingOrg,  setLoadingOrg]  = useState(true);
  const [orgError,    setOrgError]    = useState('');

  useEffect(() => {
    if (!code) {
      setLoadingOrg(false);
      setOrgError('No invite code found. Ask your admin for a fresh link.');
      return;
    }
    setLoadingOrg(true);
    supabase
      .from('organizations')
      .select('*')
      .eq('join_code', code.trim().toUpperCase())
      .eq('is_deleted', false)
      .eq('is_active', true)
      .maybeSingle()
      .then(({ data, error }) => {
        setLoadingOrg(false);
        if (error || !data) {
          setOrgError('This invite link is invalid or has expired. Ask your admin for a new one.');
        } else {
          setOrg(data);
        }
      });
  }, [code]);

  // ── Join handler (shared by logged-in and new-account flows) ─────────────────
  async function joinOrg(userId: string): Promise<string | null> {
    if (!org) return 'Organization not found.';

    const { data: existing } = await supabase
      .from('memberships')
      .select('id, status, is_deleted')
      .eq('user_id', userId)
      .eq('org_id', org.id)
      .maybeSingle();

    let membershipData: Tables<'memberships'> | null = null;

    if (existing) {
      const { data, error } = await supabase
        .from('memberships')
        .update({ status: 'active', is_deleted: false, deleted_at: null,
          joined_at: new Date().toISOString().split('T')[0],
          updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();
      if (error || !data) return error?.message ?? 'Failed to join chapter.';
      membershipData = data;
    } else {
      const { data, error } = await supabase
        .from('memberships')
        .insert({ user_id: userId, org_id: org.id, status: 'active',
          role: 'member', is_deleted: false,
          joined_at: new Date().toISOString().split('T')[0] })
        .select()
        .single();
      if (error || !data) return error?.message ?? 'Failed to join chapter.';
      membershipData = data;
    }

    setMembership(membershipData, org);
    return null; // success
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Scenario 3: already a member
  // ─────────────────────────────────────────────────────────────────────────────

  if (!loadingOrg && org && session && membership) {
    const alreadyThisOrg = membership.org_id === org.id;
    return (
      <View style={[styles.centered, { backgroundColor: c.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={[styles.alreadyCard, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Ionicons name={alreadyThisOrg ? 'checkmark-circle' : 'information-circle'} size={48}
            color={alreadyThisOrg ? '#22C55E' : c.primary} />
          <Text size="xl" weight="bold" style={{ marginTop: 12, textAlign: 'center' }}>
            {alreadyThisOrg ? `You're already in ${org.name}` : `You're already in another chapter`}
          </Text>
          <Text size="sm" color={c.textMuted} style={{ textAlign: 'center', marginTop: 6 }}>
            {alreadyThisOrg
              ? 'Head to your dashboard to get started.'
              : `You currently belong to a different chapter. Contact support if you need to switch.`}
          </Text>
          <Button label="Go to my dashboard" style={{ marginTop: 20 }}
            onPress={() => {
              const role = membership.role;
              if (role === 'org_admin' || role === 'admin') router.replace('/(admin)/dashboard' as any);
              else if (role === 'officer') router.replace('/(officer)/events-management' as any);
              else router.replace('/(member)' as any);
            }}
          />
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Loading / error state
  // ─────────────────────────────────────────────────────────────────────────────

  if (loadingOrg) {
    return (
      <View style={[styles.centered, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  if (orgError || !org) {
    return (
      <View style={[styles.centered, { backgroundColor: c.background, paddingTop: insets.top, paddingBottom: insets.bottom, paddingHorizontal: 32 }]}>
        <Ionicons name="link-outline" size={48} color={c.textMuted} />
        <Text size="xl" weight="bold" style={{ marginTop: 16, textAlign: 'center' }}>Invalid invite link</Text>
        <Text size="sm" color={c.textMuted} style={{ textAlign: 'center', marginTop: 8 }}>
          {orgError || 'This link is invalid or has expired.'}
        </Text>
        <Button label="Back to login" variant="outline" style={{ marginTop: 24 }}
          onPress={() => router.replace('/(auth)/login')} />
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Scenario 2: logged in, no membership → one-tap join
  // ─────────────────────────────────────────────────────────────────────────────

  if (session && !membership) {
    return <LoggedInJoin org={org} joinOrg={joinOrg} insets={insets} isWide={isWide} />;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Scenario 1: not logged in → register + join
  // ─────────────────────────────────────────────────────────────────────────────

  return <RegisterAndJoin org={org} code={code ?? ''} joinOrg={joinOrg} insets={insets} isWide={isWide} />;
}

// ─── Sub-component: Logged-in, no membership ──────────────────────────────────

function LoggedInJoin({ org, joinOrg, insets, isWide }: {
  org: Org;
  joinOrg: (userId: string) => Promise<string | null>;
  insets: { top: number; bottom: number };
  isWide: boolean;
}) {
  const theme   = useThemeStore((s) => s.theme);
  const { user } = useAuthStore();
  const c       = theme.colors;
  const [joining, setJoining] = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState(false);

  const dotColor = (org as any).primary_color ?? c.primary;

  async function handleJoin() {
    const userId = user?.id;
    if (!userId) { setError('Not signed in. Please restart the app.'); return; }
    setJoining(true);
    const err = await joinOrg(userId);
    setJoining(false);
    if (err) { setError(err); return; }
    setSuccess(true);
    await supabase.auth.refreshSession();
    setTimeout(() => router.replace('/(member)'), 1200);
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={[styles.scroll, isWide && styles.scrollWide,
        { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
    >
      <OrgWelcomeBanner org={org} dotColor={dotColor} c={c} />

      {success ? (
        <SuccessCard org={org} c={c} />
      ) : (
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text size="lg" weight="bold">Join {org.name}</Text>
          <Text size="sm" color={c.textMuted} style={{ marginTop: 4 }}>
            Tap below to become a member of this chapter.
          </Text>
          {error ? <Text size="sm" color={c.error} style={{ marginTop: 8 }}>{error}</Text> : null}
          <Button label="Join chapter" onPress={handleJoin} loading={joining} style={{ marginTop: 16 }} />
        </View>
      )}
    </ScrollView>
  );
}

// ─── Sub-component: Not logged in → Register + join ──────────────────────────

function RegisterAndJoin({ org, code, joinOrg, insets, isWide }: {
  org: Org;
  code: string;
  joinOrg: (userId: string) => Promise<string | null>;
  insets: { top: number; bottom: number };
  isWide: boolean;
}) {
  const theme      = useThemeStore((s) => s.theme);
  const { setSession, setLoading: setAuthLoading } = useAuthStore();
  const c          = theme.colors;

  const [firstName,        setFirstName]        = useState('');
  const [lastName,         setLastName]         = useState('');
  const [email,            setEmail]            = useState('');
  const [password,         setPassword]         = useState('');
  const [confirmPassword,  setConfirmPassword]  = useState('');
  const [showPassword,     setShowPassword]     = useState(false);
  const [showConfirm,      setShowConfirm]      = useState(false);
  const [loading,          setLoading]          = useState(false);
  const [error,            setError]            = useState('');
  const [success,          setSuccess]          = useState(false);
  const [needsConfirm,     setNeedsConfirm]     = useState(false);

  const { score, label: strengthLabel } = getStrength(password);
  const dotColor = (org as any).primary_color ?? c.primary;

  async function handleRegisterAndJoin() {
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
    setError('');
    setLoading(true);

    // 1. Create account
    const { data: signUpData, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { first_name: firstName.trim(), last_name: lastName.trim() } },
    });

    if (authError) {
      setLoading(false);
      setError(authError.message);
      return;
    }

    // Email confirmation required — can't auto-join until confirmed
    if (!signUpData.session) {
      setLoading(false);
      setNeedsConfirm(true);
      return;
    }

    // 2. Join the chapter — do this BEFORE setSession so the membership is
    //    already in the store when RootLayoutNav evaluates after the session lands.
    const userId = signUpData.session.user.id;
    const joinErr = await joinOrg(userId);

    setLoading(false);

    if (joinErr) {
      // Account created but join failed — set session and go to onboarding as fallback
      setSession(signUpData.session);
      router.replace('/(auth)/onboarding');
      return;
    }

    // Membership is already in the store (set by joinOrg → setMembership).
    // Set isLoading: true BEFORE setSession so RootLayoutNav stays suppressed
    // while onAuthStateChange fires and loadUserData re-fetches from the DB.
    // loadUserData will set isLoading: false once it has fresh data, at which
    // point membership will be populated from the DB and the guard will route
    // correctly to /(member).
    setAuthLoading(true);
    setSession(signUpData.session);
    setSuccess(true);
    setTimeout(() => router.replace('/(member)'), 1200);
  }

  const dotColorMuted = dotColor + '22';

  if (needsConfirm) {
    return (
      <View style={[styles.centered, { backgroundColor: c.background, paddingHorizontal: 32,
        paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={[styles.alreadyCard, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Ionicons name="mail-outline" size={48} color={c.primary} />
          <Text size="xl" weight="bold" style={{ marginTop: 12, textAlign: 'center' }}>Check your email</Text>
          <Text size="sm" color={c.textMuted} style={{ textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
            We sent a confirmation link to{' '}
            <Text size="sm" weight="medium" color={c.text}>{email}</Text>.
            {'\n\n'}After confirming, come back and log in — your invite code{' '}
            <Text size="sm" weight="medium" color={c.text}>{code}</Text> will still work.
          </Text>
          <Button label="Go to login" style={{ marginTop: 20 }}
            onPress={() => router.replace('/(auth)/login')} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, isWide && styles.scrollWide,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo */}
        <View style={styles.logoRow}>
          <Image source={require('@/assets/images/wordmark-light.png')}
            style={styles.wordmark} resizeMode="contain" />
        </View>

        <OrgWelcomeBanner org={org} dotColor={dotColor} c={c} />

        {success ? (
          <SuccessCard org={org} c={c} />
        ) : (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text size="lg" weight="bold">Create your account</Text>
            <Text size="sm" color={c.textMuted} style={{ marginTop: 2, marginBottom: 16 }}>
              You'll be added to {org.name} automatically after signing up.
            </Text>

            <View style={styles.fields}>
              {/* Name row */}
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

              <Input label="Email" value={email} onChangeText={setEmail}
                placeholder="you@gmail.com" autoCapitalize="none"
                keyboardType="email-address" autoComplete="email" />

              {/* Password row */}
              <View style={styles.twoCol}>
                <View style={{ flex: 1 }}>
                  <Input label="Password" value={password} onChangeText={setPassword}
                    placeholder="8+ characters" secureTextEntry={!showPassword}
                    autoComplete="new-password"
                    rightElement={
                      <TouchableOpacity onPress={() => setShowPassword((v) => !v)}>
                        <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                          size={18} color={c.textMuted} />
                      </TouchableOpacity>
                    }
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input label="Confirm" value={confirmPassword} onChangeText={setConfirmPassword}
                    placeholder="••••••••" secureTextEntry={!showConfirm}
                    autoComplete="new-password"
                    rightElement={
                      <TouchableOpacity onPress={() => setShowConfirm((v) => !v)}>
                        <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                          size={18} color={c.textMuted} />
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
                      <View key={i} style={[styles.strengthBar,
                        { backgroundColor: i < score ? BAR_COLORS[score - 1] : c.border }]} />
                    ))}
                  </View>
                  <Text size="xs" color={c.textMuted}>
                    {strengthLabel} · 8 chars, number, symbol
                  </Text>
                </View>
              )}

              {error ? <Text size="sm" color={c.error}>{error}</Text> : null}

              <Button label={`Join ${org.name}`} onPress={handleRegisterAndJoin}
                loading={loading} style={{ marginTop: 4 }} />
            </View>

            {/* Login link */}
            <View style={styles.loginLink}>
              <Text size="sm" color={c.textMuted}>Already have an account? </Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
                <Text size="sm" color={c.primary} weight="medium">Log in</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function OrgWelcomeBanner({ org, dotColor, c }: { org: Org; dotColor: string; c: any }) {
  return (
    <View style={[styles.welcomeBanner, { backgroundColor: dotColor + '12', borderColor: dotColor + '40' }]}>
      <View style={[styles.orgBadge, { backgroundColor: dotColor + '22' }]}>
        <Text size="xl" weight="bold" color={dotColor}>{org.name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text size="xs" weight="medium" color={dotColor}
          style={{ textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 }}>
          You've been invited to join
        </Text>
        <Text size="lg" weight="bold">{org.name}</Text>
        {org.institution ? (
          <Text size="sm" color={c.textMuted} style={{ marginTop: 2 }}>{org.institution}</Text>
        ) : null}
      </View>
    </View>
  );
}

function SuccessCard({ org, c }: { org: Org; c: any }) {
  return (
    <View style={[styles.successCard, { backgroundColor: '#22C55E14', borderColor: '#22C55E' }]}>
      <View style={[styles.successIcon, { backgroundColor: '#22C55E18' }]}>
        <Ionicons name="checkmark" size={32} color="#22C55E" />
      </View>
      <Text size="xl" weight="bold" style={{ marginTop: 12, textAlign: 'center' }}>You're in!</Text>
      <Text size="sm" color={c.textMuted} style={{ textAlign: 'center', marginTop: 4 }}>
        Welcome to {org.name}. Taking you to your dashboard…
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  centered:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:        { flexGrow: 1, paddingHorizontal: 24, gap: 16 },
  scrollWide:    { paddingHorizontal: 48, maxWidth: 640, alignSelf: 'center', width: '100%' },

  logoRow:       { alignItems: 'center', marginBottom: 8 },
  wordmark:      { width: 140, height: 36 },

  welcomeBanner: { flexDirection: 'row', alignItems: 'center', gap: 14,
                   borderWidth: 1, borderRadius: 16, padding: 16 },
  orgBadge:      { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  card:          { borderWidth: 1, borderRadius: 16, padding: 20 },
  fields:        { gap: 14 },
  twoCol:        { flexDirection: 'row', gap: 12 },
  strengthSection: { gap: 6, marginTop: -4 },
  strengthBars:  { flexDirection: 'row', gap: 4 },
  strengthBar:   { flex: 1, height: 3, borderRadius: 2 },
  loginLink:     { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },

  alreadyCard:   { borderWidth: 1, borderRadius: 16, padding: 28, alignItems: 'center',
                   width: '100%', maxWidth: 400 },

  successCard:   { borderWidth: 1, borderRadius: 16, padding: 32, alignItems: 'center' },
  successIcon:   { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
});
