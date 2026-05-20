import { boolean, index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod/v4';

import { organizations } from './organizations';
import { profiles } from './profiles';

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => profiles.id).notNull(),
    orgId: uuid('org_id').references(() => organizations.id).notNull(),
    status: text('status').notNull().default('active'),
    isBlocked: boolean('is_blocked').default(false),
    blockReason: text('block_reason'),
    blockedAt: timestamp('blocked_at', { withTimezone: true }),
    blockedBy: uuid('blocked_by').references(() => profiles.id),
    canAttendEvents: boolean('can_attend_events').default(true),
    canRsvpEvents: boolean('can_rsvp_events').default(true),
    canViewCalendar: boolean('can_view_calendar').default(true),
    canSubmitExcuses: boolean('can_submit_excuses').default(true),
    duesStatus: text('dues_status').notNull().default('current'),
    duesBalance: numeric('dues_balance', { precision: 10, scale: 2 }).default('0.00'),
    duesLastPaidAt: timestamp('dues_last_paid_at', { withTimezone: true }),
    duesHold: boolean('dues_hold').default(false),
    duesHoldSince: timestamp('dues_hold_since', { withTimezone: true }),
    duesHoldThreshold: numeric('dues_hold_threshold', { precision: 10, scale: 2 }),
    joinedAt: text('joined_at'),
    initiatedAt: text('initiated_at'),
    graduatedAt: text('graduated_at'),
    memberNumber: text('member_number'),
    pinNumber: text('pin_number'),
    isVisible: boolean('is_visible').default(true),
    isDeleted: boolean('is_deleted').default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_memberships_org').on(t.orgId),
    index('idx_memberships_user').on(t.userId),
    index('idx_memberships_status').on(t.status),
  ],
);

export const insertMembershipSchema = createInsertSchema(memberships, {
  status: z
    .enum(['active', 'inactive', 'alumni', 'suspended', 'pending', 'new_member'])
    .optional(),
  duesStatus: z
    .enum(['current', 'overdue', 'delinquent', 'waived', 'payment_plan'])
    .optional(),
}).omit({ id: true, createdAt: true, updatedAt: true, isDeleted: true, deletedAt: true });

export const selectMembershipSchema = createSelectSchema(memberships);

export type InsertMembership = z.infer<typeof insertMembershipSchema>;
export type Membership = typeof memberships.$inferSelect;
