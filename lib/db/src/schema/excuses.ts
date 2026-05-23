import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod/v4';

import { organizations } from './organizations';
import { profiles } from './profiles';
import { memberships } from './memberships';

// ─── excuses ──────────────────────────────────────────────────────────────────

export const excuses = pgTable(
  'excuses',
  {
    id:              uuid('id').primaryKey().defaultRandom(),
    orgId:           uuid('org_id').references(() => organizations.id).notNull(),
    userId:          uuid('user_id').references(() => profiles.id).notNull(),
    membershipId:    uuid('membership_id').references(() => memberships.id),
    eventId:         uuid('event_id').notNull(),
    reason:          text('reason').notNull(),
    supportingDocs:  text('supporting_docs').array(),
    status:          text('status').notNull().default('pending'),
    submittedAt:     timestamp('submitted_at', { withTimezone: true }).defaultNow(),
    reviewedBy:      uuid('reviewed_by').references(() => profiles.id),
    reviewedAt:      timestamp('reviewed_at', { withTimezone: true }),
    adminNotes:      text('admin_notes'),
    reviewerNote:    text('reviewer_note'),
    escalatedTo:     uuid('escalated_to').references(() => profiles.id),
    escalatedAt:     timestamp('escalated_at', { withTimezone: true }),
    escalationReason: text('escalation_reason'),
    createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt:       timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_excuses_status').on(t.status),
    index('idx_excuses_event').on(t.eventId),
    index('idx_excuses_membership').on(t.membershipId),
    index('idx_excuses_org').on(t.orgId),
  ],
);

// ─── excuse_audit_log ─────────────────────────────────────────────────────────

export const excuseAuditLog = pgTable(
  'excuse_audit_log',
  {
    id:             uuid('id').primaryKey().defaultRandom(),
    excuseId:       uuid('excuse_id').references(() => excuses.id).notNull(),
    changedBy:      uuid('changed_by').references(() => profiles.id).notNull(),
    previousStatus: text('previous_status'),
    newStatus:      text('new_status'),
    note:           text('note'),
    changedAt:      timestamp('changed_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_excuse_audit_excuse').on(t.excuseId),
    index('idx_excuse_audit_changed').on(t.changedAt),
  ],
);

// ─── Zod schemas & types ──────────────────────────────────────────────────────

export const insertExcuseSchema = createInsertSchema(excuses).omit({
  id: true, createdAt: true, updatedAt: true, submittedAt: true,
  reviewedAt: true, escalatedAt: true,
});
export const selectExcuseSchema = createSelectSchema(excuses);
export type InsertExcuse = z.infer<typeof insertExcuseSchema>;
export type Excuse = typeof excuses.$inferSelect;

export const insertExcuseAuditSchema = createInsertSchema(excuseAuditLog).omit({
  id: true, changedAt: true,
});
export type InsertExcuseAudit = z.infer<typeof insertExcuseAuditSchema>;
export type ExcuseAudit = typeof excuseAuditLog.$inferSelect;
