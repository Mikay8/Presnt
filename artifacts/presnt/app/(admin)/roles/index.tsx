/**
 * Admin — Roles Management
 *
 * Admins create and edit officer roles here. Each role has a name,
 * a display color, and a set of permissions drawn from ALL_PERMISSIONS.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Text } from '@/components/ui';
import { DOMAIN, loggedQuery } from '@/lib/apiLogger';
import { ALL_PERMISSIONS, ROLE_COLORS, type Permission } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import type { Tables } from '@/types/database';

type OrgRole = Tables<'org_roles'>;

// ─── Role card ────────────────────────────────────────────────────────────────

function RoleCard({
  role,
  onEdit,
  onDelete,
}: {
  role: OrgRole;
  onEdit: (r: OrgRole) => void;
  onDelete: (r: OrgRole) => void;
}) {
  const { theme } = useThemeStore();
  const permLabels = role.permissions
    .map((p) => ALL_PERMISSIONS.find((a) => a.key === p)?.label ?? p)
    .join(' · ');

  return (
    <Card style={styles.roleCard}>
      <View style={styles.roleCardTop}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <View style={[styles.roleDot, { backgroundColor: role.color }]} />
          <View style={{ flex: 1 }}>
            <Text size="md" weight="bold">{role.name}</Text>
            <Text size="xs" color={theme.colors.textMuted} style={{ marginTop: 2 }}>
              {role.permissions.length === 0
                ? 'No permissions'
                : `${role.permissions.length} permission${role.permissions.length !== 1 ? 's' : ''}`}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => onEdit(role)}
            style={[styles.iconBtn, { borderColor: theme.colors.border }]}
          >
            <Ionicons name="pencil-outline" size={15} color={theme.colors.text} />
          </Pressable>
          <Pressable
            onPress={() => onDelete(role)}
            style={[styles.iconBtn, { borderColor: theme.colors.border }]}
          >
            <Ionicons name="trash-outline" size={15} color={theme.colors.error ?? '#E53935'} />
          </Pressable>
        </View>
      </View>

      {role.permissions.length > 0 && (
        <Text size="xs" color={theme.colors.textSubtle} style={{ marginTop: 8 }}>
          {permLabels}
        </Text>
      )}
    </Card>
  );
}

// ─── Role form modal ──────────────────────────────────────────────────────────

function RoleModal({
  visible,
  initial,
  onClose,
  onSave,
  saving,
}: {
  visible: boolean;
  initial: Partial<OrgRole> | null;
  onClose: () => void;
  onSave:  (name: string, color: string, permissions: string[]) => void;
  saving:  boolean;
}) {
  const { theme } = useThemeStore();
  const isEdit = !!initial?.id;

  const [name, setName]   = useState('');
  const [color, setColor] = useState<string>(ROLE_COLORS[0]);
  const [perms, setPerms] = useState<Set<string>>(new Set());

  // Reset form when modal opens
  useEffect(() => {
    if (visible) {
      setName(initial?.name ?? '');
      setColor(initial?.color ?? ROLE_COLORS[0]);
      setPerms(new Set(initial?.permissions ?? []));
    }
  }, [visible, initial]);

  function togglePerm(key: Permission) {
    setPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const c = theme.colors;

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: c.surface }]}>
          {/* Handle */}
          <View style={[styles.handle, { backgroundColor: c.border }]} />

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text size="lg" weight="bold" style={{ marginBottom: 20 }}>
              {isEdit ? 'Edit Role' : 'New Role'}
            </Text>

            {/* Name */}
            <Text size="xs" weight="medium" color={c.textMuted}
              style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              Role Name
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. VP of Finance"
              placeholderTextColor={c.textSubtle}
              style={[
                styles.input,
                { backgroundColor: c.background, borderColor: c.border, color: c.text,
                  fontFamily: theme.typography.fontFamily.regular,
                  // @ts-ignore web
                  outline: 'none' },
              ]}
            />

            {/* Color */}
            <Text size="xs" weight="medium" color={c.textMuted}
              style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: 20, marginBottom: 10 }}>
              Color
            </Text>
            <View style={styles.colorRow}>
              {ROLE_COLORS.map((col) => (
                <Pressable
                  key={col}
                  onPress={() => setColor(col)}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: col },
                    color === col && styles.colorSwatchSelected,
                  ]}
                >
                  {color === col && (
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  )}
                </Pressable>
              ))}
            </View>

            {/* Permissions */}
            <Text size="xs" weight="medium" color={c.textMuted}
              style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: 24, marginBottom: 10 }}>
              Permissions
            </Text>
            <View style={[styles.permList, { borderColor: c.border }]}>
              {ALL_PERMISSIONS.map((perm, i) => {
                const checked = perms.has(perm.key);
                return (
                  <Pressable
                    key={perm.key}
                    onPress={() => togglePerm(perm.key)}
                    style={[
                      styles.permRow,
                      i < ALL_PERMISSIONS.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border },
                    ]}
                  >
                    <View style={[
                      styles.checkbox,
                      { borderColor: checked ? color : c.border,
                        backgroundColor: checked ? color : 'transparent' },
                    ]}>
                      {checked && <Ionicons name="checkmark" size={12} color="#fff" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text size="sm" weight={checked ? 'medium' : 'regular'}>{perm.label}</Text>
                      <Text size="xs" color={c.textSubtle}>{perm.description}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {/* Actions */}
          <View style={styles.modalActions}>
            <Button
              label="Cancel"
              variant="outline"
              style={{ flex: 1 }}
              onPress={onClose}
            />
            <Button
              label={isEdit ? 'Save Changes' : 'Create Role'}
              style={{ flex: 1 }}
              loading={saving}
              onPress={() => {
                if (!name.trim()) return;
                onSave(name.trim(), color, Array.from(perms));
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AdminRolesScreen() {
  const { theme }    = useThemeStore();
  const insets       = useSafeAreaInsets();
  const { width }    = useWindowDimensions();
  const isWide       = width >= 800;
  const { membership, profile } = useAuthStore();

  const [roles, setRoles]         = useState<OrgRole[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefresh]  = useState(false);
  const [modalVisible, setModal]  = useState(false);
  const [editing, setEditing]     = useState<OrgRole | null>(null);
  const [saving, setSaving]       = useState(false);

  const orgId = membership?.org_id;
  const userId = profile?.id;

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    const { data } = await loggedQuery({
      domain: DOMAIN.ROLES, method: 'GET', endpoint: 'org_roles',
      orgId, userId,
      query: supabase
        .from('org_roles')
        .select('*')
        .eq('org_id', orgId)
        .order('name'),
    });
    setRoles(data ?? []);
    setLoading(false);
    setRefresh(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  function openCreate() { setEditing(null); setModal(true); }
  function openEdit(r: OrgRole) { setEditing(r); setModal(true); }

  async function handleSave(name: string, color: string, permissions: string[]) {
    if (!orgId || !userId) return;
    setSaving(true);

    if (editing) {
      await loggedQuery({
        domain: DOMAIN.ROLES, method: 'PATCH', endpoint: 'org_roles',
        orgId, userId,
        requestBody: { id: editing.id, name, color, permissions },
        query: supabase
          .from('org_roles')
          .update({ name, color, permissions, updated_at: new Date().toISOString() })
          .eq('id', editing.id),
      });
    } else {
      await loggedQuery({
        domain: DOMAIN.ROLES, method: 'POST', endpoint: 'org_roles',
        orgId, userId,
        requestBody: { name, color, permissions },
        query: supabase
          .from('org_roles')
          .insert({ org_id: orgId, name, color, permissions, created_by: userId }),
      });
    }

    await load();
    setSaving(false);
    setModal(false);
  }

  async function handleDelete(role: OrgRole) {
    Alert.alert(
      'Delete Role',
      `Delete "${role.name}"? Members assigned this role will be set to plain officer.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await loggedQuery({
              domain: DOMAIN.ROLES, method: 'DELETE', endpoint: 'org_roles',
              orgId, userId,
              requestBody: { id: role.id },
              query: supabase.from('org_roles').delete().eq('id', role.id),
            });
            await load();
          },
        },
      ],
    );
  }

  const c = theme.colors;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View style={[
        styles.header,
        { paddingTop: isWide ? 20 : insets.top + 12, backgroundColor: c.surface, borderBottomColor: c.border },
      ]}>
        <View>
          <Text size="xxl" weight="bold">Roles</Text>
          <Text size="xs" color={c.textMuted} style={{ marginTop: 2 }}>
            {roles.length} officer role{roles.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <Pressable
          onPress={openCreate}
          style={[styles.newBtn, { backgroundColor: c.primary }]}
        >
          <Ionicons name="add" size={16} color="#fff" />
          <Text size="sm" weight="bold" style={{ color: '#fff' }}>New Role</Text>
        </Pressable>
      </View>

      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={[
          styles.scroll,
          isWide && styles.scrollWide,
          roles.length === 0 && { flex: 1 },
          !isWide && { paddingBottom: insets.bottom + 24 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefresh(true); load(); }}
            tintColor={c.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {roles.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="shield-outline" size={48} color={c.textSubtle} />
            <Text size="lg" weight="bold" style={{ marginTop: 16 }}>No officer roles yet</Text>
            <Text size="sm" color={c.textMuted} style={{ textAlign: 'center', marginTop: 6, lineHeight: 20 }}>
              Create roles to assign custom permissions to officers.{'\n'}
              For example: "VP of Finance", "Social Chair", "Risk Manager".
            </Text>
            <Button
              label="Create first role"
              style={{ marginTop: 20 }}
              onPress={openCreate}
            />
          </View>
        ) : (
          roles.map((role) => (
            <RoleCard
              key={role.id}
              role={role}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))
        )}
      </ScrollView>

      <RoleModal
        visible={modalVisible}
        initial={editing}
        onClose={() => setModal(false)}
        onSave={handleSave}
        saving={saving}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  newBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  scroll:    { padding: 20, gap: 12, paddingBottom: 48 },
  scrollWide:{ paddingHorizontal: 48, maxWidth: 760, alignSelf: 'center', width: '100%' },

  roleCard:    { gap: 0 },
  roleCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roleDot:     { width: 14, height: 14, borderRadius: 7 },
  iconBtn:     { width: 32, height: 32, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  emptyState:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet:   { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, maxHeight: '90%' },
  handle:       { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },

  input: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15,
  },

  colorRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorSwatch: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  colorSwatchSelected: { transform: [{ scale: 1.15 }] },

  permList: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  permRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },

  modalActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
});
