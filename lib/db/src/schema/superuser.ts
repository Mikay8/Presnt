import { pgTable, uuid, text, jsonb, inet, timestamp } from 'drizzle-orm/pg-core';
import { profiles } from './profiles';

export const superuserAuditLog = pgTable('superuser_audit_log', {
  id:            uuid('id').primaryKey().defaultRandom(),
  performedBy:   uuid('performed_by').references(() => profiles.id).notNull(),
  action:        text('action').notNull(),
  targetType:    text('target_type'),
  targetId:      uuid('target_id'),
  previousValue: jsonb('previous_value'),
  newValue:      jsonb('new_value'),
  notes:         text('notes'),
  ipAddress:     inet('ip_address'),
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const platformConfig = pgTable('platform_config', {
  key:         text('key').primaryKey(),
  value:       text('value').notNull(),
  description: text('description'),
  updatedBy:   uuid('updated_by').references(() => profiles.id),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
