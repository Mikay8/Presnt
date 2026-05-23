/**
 * User View Store
 *
 * Allows superusers to simulate the app as a specific role within a specific org.
 * When active, the root layout routes to the relevant portal and a persistent
 * banner is shown so the superuser can exit at any time.
 *
 * This never touches Supabase auth — it only shims the authStore values that
 * the portals (admin/officer/member layouts) read for their guards and UI.
 */

import { create } from 'zustand';

import type { Tables } from '@/types/database';
import type { UserRole } from '@/stores/authStore';

type Organization = Tables<'organizations'>;

export type ViewRole = 'member' | 'officer' | 'admin' | 'org_admin';

export interface UserViewSession {
  role:        ViewRole;
  org:         Organization;
  permissions: string[];   // only relevant when role === 'officer'
}

interface UserViewStore {
  session: UserViewSession | null;

  start: (s: UserViewSession) => void;
  stop:  () => void;
}

export const useUserViewStore = create<UserViewStore>((set) => ({
  session: null,

  start: (session) => set({ session }),
  stop:  ()        => set({ session: null }),
}));
