import { useAuthStore } from '@/stores/authStore';
import type { Permission } from '@/lib/permissions';

export type PermissionResult = {
  /** Check a specific permission. Admins always return true. */
  can:        (permission: Permission) => boolean;
  /** True for both admin and org_admin */
  isAdmin:    boolean;
  /** True only for org_admin — can see org management + all chapters */
  isOrgAdmin: boolean;
  /** True when role === 'officer' */
  isOfficer:  boolean;
  /** True when role === 'member' or 'new_member' */
  isMember:   boolean;
  role:       string;
};

export function usePermissions(): PermissionResult {
  const { membership, customRole } = useAuthStore();
  const role = membership?.role ?? 'member';

  const isOrgAdmin = role === 'org_admin';
  const isAdmin    = role === 'admin' || role === 'org_admin';
  const isOfficer  = role === 'officer';
  const isMember   = role === 'member' || role === 'new_member';

  function can(permission: Permission): boolean {
    // Admins have every permission
    if (isAdmin) return true;
    // Officers: check their custom role's permissions array
    if (isOfficer && customRole) {
      return customRole.permissions.includes(permission);
    }
    return false;
  }

  return { can, isAdmin, isOrgAdmin, isOfficer, isMember, role };
}
