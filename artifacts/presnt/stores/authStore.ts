import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';

import type { Tables } from '@/types/database';

type Profile = Tables<'profiles'>;
type Membership = Tables<'memberships'>;
type Organization = Tables<'organizations'>;

export type UserRole = 'member' | 'officer' | 'admin';

interface AuthStore {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  membership: Membership | null;
  organization: Organization | null;
  role: UserRole | null;
  isLoading: boolean;

  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  setMembership: (membership: Membership | null, org: Organization | null) => void;
  setRole: (role: UserRole | null) => void;
  setLoading: (loading: boolean) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  session: null,
  user: null,
  profile: null,
  membership: null,
  organization: null,
  role: null,
  isLoading: true,

  setSession: (session) => set({ session, user: session?.user ?? null }),
  setProfile: (profile) => set({ profile }),
  setMembership: (membership, organization) => set({ membership, organization }),
  setRole: (role) => set({ role }),
  setLoading: (isLoading) => set({ isLoading }),
  clear: () =>
    set({
      session: null,
      user: null,
      profile: null,
      membership: null,
      organization: null,
      role: null,
      isLoading: false,
    }),
}));
