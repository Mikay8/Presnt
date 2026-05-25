import type { DemoRole } from '@/stores/demoStore';

export const DEMO_ACCOUNTS: Record<DemoRole, { email: string; password: string }> = {
  admin:  {
    email:    'admin-test2@presnt.link',
    password: process.env.EXPO_PUBLIC_DEMO_ADMIN_PASSWORD ?? '',
  },
  member: {
    email:    'jimmy-john@presnt.link',
    password: process.env.EXPO_PUBLIC_DEMO_MEMBER_PASSWORD ?? '',
  },
};

export const DEMO_ROLE_LABEL: Record<DemoRole, string> = {
  admin:  'Admin',
  member: 'Member',
};
