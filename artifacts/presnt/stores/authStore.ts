import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';

import type { Tables } from '@/types/database';

type Profile    = Tables<'profiles'>;
type Membership = Tables<'memberships'>;
type Organization = Tables<'organizations'>;

export type UserRole = 'member' | 'new_member' | 'officer' | 'admin' | 'org_admin';

// Custom officer role from org_roles table
export type OrgRole = {
  id:          string;
  name:        string;
  color:       string;
  permissions: string[];
};

interface AuthStore {
  session:      Session | null;
  user:         User | null;
  profile:      Profile | null;
  membership:   Membership | null;
  organization: Organization | null;
  customRole:   OrgRole | null;      // loaded when role = 'officer' and custom_role_id is set
  isLoading:    boolean;

  setSession:    (session: Session | null) => void;
  setProfile:    (profile: Profile | null) => void;
  setMembership: (membership: Membership | null, org: Organization | null) => void;
  setCustomRole: (role: OrgRole | null) => void;
  setLoading:    (loading: boolean) => void;
  clear:         () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  session:      null,
  user:         null,
  profile:      null,
  membership:   null,
  organization: null,
  customRole:   null,
  isLoading:    true,

  setSession:    (session)    => set({ session, user: session?.user ?? null }),
  setProfile:    (profile)    => set({ profile }),
  setMembership: (membership, organization) => set({ membership, organization }),
  setCustomRole: (customRole) => set({ customRole }),
  setLoading:    (isLoading)  => set({ isLoading }),

  clear: () =>
    set({
      session:      null,
      user:         null,
      profile:      null,
      membership:   null,
      organization: null,
      customRole:   null,
      isLoading:    false,
    }),
}));
