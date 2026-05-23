import {
  boolean,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod/v4';

import { memberships } from './memberships';
import { organizations } from './organizations';
import { profiles } from './profiles';

// ─── member_restrictions ──────────────────────────────────────────────────────

export const memberRestrictions = pgTable(
  'member_restrictions',
  {
    id:                    uuid('id').primaryKey().defaultRandom(),
    membershipId:          uuid('membership_id').references(() => memberships.id).notNull(),
    orgId:                 uuid('org_id').references(() => organizations.id).notNull(),
    restrictionType:       text('restriction_type').notNull(),
    blocksEventAttendance: boolean('blocks_event_attendance').default(true),
    blocksEventRsvp:       boolean('blocks_event_rsvp').default(true),
    blocksCalendarView:    boolean('blocks_calendar_view').default(false),
    blocksExcuseSubmission:boolean('blocks_excuse_submission').default(false),
    blocksVoting:          boolean('blocks_voting').default(false),
    blocksAppAccess:       boolean('blocks_app_access').default(false),
    reason:                text('reason').notNull(),
    internalNote:          text('internal_note'),
    createdBy:             uuid('created_by').references(() => profiles.id).notNull(),
    startsAt:              timestamp('starts_at', { withTimezone: true }).defaultNow().notNull(),
    endsAt:                timestamp('ends_at', { withTimezone: true }),
    autoLiftCondition:     text('auto_lift_condition'),
    isActive:              boolean('is_active').default(true),
    liftedBy:              uuid('lifted_by').references(() => profiles.id),
    liftedAt:              timestamp('lifted_at', { withTimezone: true }),
    liftReason:            text('lift_reason'),
    createdAt:             timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt:             timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_restrictions_membership_active').on(t.membershipId, t.isActive),
    index('idx_restrictions_org').on(t.orgId),
  ],
);

export const insertMemberRestrictionSchema = createInsertSchema(memberRestrictions, {
  restrictionType: z.enum(['dues_hold', 'manual_block', 'suspension', 'probation', 'inactive']),
  autoLiftCondition: z.enum(['dues_paid', 'officer_approval', 'term_end']).optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const selectMemberRestrictionSchema = createSelectSchema(memberRestrictions);

export type InsertMemberRestriction = z.infer<typeof insertMemberRestrictionSchema>;
export type MemberRestriction = typeof memberRestrictions.$inferSelect;

// ─── dues_balances ────────────────────────────────────────────────────────────

export const duesBalances = pgTable(
  'dues_balances',
  {
    id:              uuid('id').primaryKey().defaultRandom(),
    membershipId:    uuid('membership_id').references(() => memberships.id).notNull(),
    orgId:           uuid('org_id').references(() => organizations.id).notNull(),
    termId:          uuid('term_id'),            // soft ref to academic_terms
    amountDue:       numeric('amount_due', { precision: 10, scale: 2 }).notNull().default('0.00'),
    amountPaid:      numeric('amount_paid', { precision: 10, scale: 2 }).notNull().default('0.00'),
    amountWaived:    numeric('amount_waived', { precision: 10, scale: 2 }).notNull().default('0.00'),
    dueDate:         timestamp('due_date', { withTimezone: true }),
    gracePeriodDays: numeric('grace_period_days', { precision: 4, scale: 0 }).default('14'),
    status:          text('status').notNull().default('unpaid'),
    paymentPlan:     boolean('payment_plan').default(false),
    paymentPlanTerms:jsonb('payment_plan_terms'),
    autoHoldEnabled: boolean('auto_hold_enabled').default(true),
    holdThreshold:   numeric('hold_threshold', { precision: 10, scale: 2 }).default('0.01'),
    notes:           text('notes'),
    createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt:       timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_dues_balances_membership').on(t.membershipId),
    index('idx_dues_balances_org_term').on(t.orgId, t.termId),
  ],
);

export const insertDuesBalanceSchema = createInsertSchema(duesBalances, {
  status: z.enum(['unpaid', 'partial', 'paid', 'overdue', 'waived', 'payment_plan']).optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const selectDuesBalanceSchema = createSelectSchema(duesBalances);

export type InsertDuesBalance = z.infer<typeof insertDuesBalanceSchema>;
export type DuesBalance = typeof duesBalances.$inferSelect;

// ─── dues_transactions ────────────────────────────────────────────────────────

export const duesTransactions = pgTable(
  'dues_transactions',
  {
    id:              uuid('id').primaryKey().defaultRandom(),
    duesBalanceId:   uuid('dues_balance_id').references(() => duesBalances.id).notNull(),
    membershipId:    uuid('membership_id').references(() => memberships.id).notNull(),
    orgId:           uuid('org_id').references(() => organizations.id).notNull(),
    type:            text('type').notNull(),
    amount:          numeric('amount', { precision: 10, scale: 2 }).notNull(),
    direction:       text('direction').notNull(),
    description:     text('description').notNull(),
    referenceId:     text('reference_id'),
    paymentMethod:   text('payment_method'),
    recordedBy:      uuid('recorded_by').references(() => profiles.id).notNull(),
    transactionDate: timestamp('transaction_date', { withTimezone: true }).defaultNow(),
    createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_dues_transactions_balance').on(t.duesBalanceId),
    index('idx_dues_transactions_membership').on(t.membershipId),
  ],
);

export const insertDuesTransactionSchema = createInsertSchema(duesTransactions, {
  type:          z.enum(['payment', 'charge', 'waiver', 'refund', 'adjustment', 'late_fee']),
  direction:     z.enum(['credit', 'debit']),
  paymentMethod: z.enum(['stripe', 'cash', 'check', 'venmo', 'manual']).optional(),
}).omit({ id: true, createdAt: true });

export const selectDuesTransactionSchema = createSelectSchema(duesTransactions);

export type InsertDuesTransaction = z.infer<typeof insertDuesTransactionSchema>;
export type DuesTransaction = typeof duesTransactions.$inferSelect;

// ─── restriction_audit_log ────────────────────────────────────────────────────

export const restrictionAuditLog = pgTable(
  'restriction_audit_log',
  {
    id:            uuid('id').primaryKey().defaultRandom(),
    membershipId:  uuid('membership_id').references(() => memberships.id).notNull(),
    restrictionId: uuid('restriction_id').references(() => memberRestrictions.id),
    orgId:         uuid('org_id').references(() => organizations.id).notNull(),
    action:        text('action').notNull(),
    performedBy:   uuid('performed_by').references(() => profiles.id),
    reason:        text('reason'),
    context:       jsonb('context'),
    createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_restriction_audit_membership').on(t.membershipId),
  ],
);

export type RestrictionAuditLog = typeof restrictionAuditLog.$inferSelect;
