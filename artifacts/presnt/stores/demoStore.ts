import { create } from 'zustand';

export type DemoRole = 'admin' | 'member';

interface DemoStore {
  isActive: boolean;
  role: DemoRole | null;
  startDemo: (role: DemoRole) => void;
  stopDemo: () => void;
}

export const useDemoStore = create<DemoStore>((set) => ({
  isActive: false,
  role: null,
  startDemo: (role) => set({ isActive: true, role }),
  stopDemo: () => set({ isActive: false, role: null }),
}));
