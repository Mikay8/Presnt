// ─── Permission constants ──────────────────────────────────────────────────────
// These are the discrete capabilities an officer role can hold.
// Admins (admin / org_admin) implicitly have ALL permissions.

export const PERMISSIONS = {
  MANAGE_EVENTS:      'manage_events',
  MANAGE_ATTENDANCE:  'manage_attendance',
  POST_ANNOUNCEMENTS: 'post_announcements',
  MANAGE_DUES:        'manage_dues',
  MANAGE_MEMBERS:     'manage_members',
  ASSIGN_ROLES:       'assign_roles',
  VIEW_REPORTS:       'view_reports',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: {
  key:         Permission;
  label:       string;
  description: string;
}[] = [
  {
    key:         'manage_events',
    label:       'Manage Events',
    description: 'Create, edit, and cancel events',
  },
  {
    key:         'manage_attendance',
    label:       'Manage Attendance',
    description: 'Mark attendance and manage check-ins',
  },
  {
    key:         'post_announcements',
    label:       'Post Announcements',
    description: 'Create and delete announcements',
  },
  {
    key:         'manage_dues',
    label:       'Manage Dues',
    description: 'Update dues status and balance',
  },
  {
    key:         'manage_members',
    label:       'Manage Members',
    description: 'Invite, remove, and update member info',
  },
  {
    key:         'assign_roles',
    label:       'Assign Roles',
    description: 'Assign officer roles to members',
  },
  {
    key:         'view_reports',
    label:       'View Reports',
    description: 'Access attendance and dues reports',
  },
];

// Role hierarchy — higher index = higher authority
export const ROLE_RANK: Record<string, number> = {
  member:    0,
  new_member: 0,
  officer:   1,
  admin:     2,
  org_admin: 3,
};

// Color palette for officer roles
export const ROLE_COLORS = [
  '#E26B4A', // primary orange
  '#A855F7', // purple
  '#3B82F6', // blue
  '#22C55E', // green
  '#EAB308', // yellow
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F97316', // amber
] as const;

export type RoleColor = (typeof ROLE_COLORS)[number];
