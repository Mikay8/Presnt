import { boolean, index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod/v4';
import { profiles } from './profiles';

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').unique().notNull(),
  type: text('type').notNull(),
  parentOrgId: uuid('parent_org_id').references((): any => organizations.id),
  createdBy: uuid('created_by').references(() => profiles.id),
  joinCode: text('join_code').unique(),
  greekLetterOrg: text('greek_letter_org'),
  institution: text('institution'),
  foundingYear: numeric('founding_year'),
  timezone: text('timezone').notNull().default('America/New_York'),
  isActive: boolean('is_active').default(true),
  stripeCustomerId: text('stripe_customer_id'),
  subscriptionTier: text('subscription_tier').default('free'),
  subscriptionStatus: text('subscription_status').default('active'),

  logoUrl: text('logo_url'),
  bannerUrl: text('banner_url'),
  primaryColor: text('primary_color').default('#F08862'),
  secondaryColor: text('secondary_color').default('#E26B4A'),
  backgroundColor: text('background_color').default('#1A1411'),
  textColor: text('text_color').default('#FBF6EE'),
  accentColor: text('accent_color').default('#E0B250'),
  colorScheme: text('color_scheme').default('dark'),
  customFont: text('custom_font'),
  appDisplayName: text('app_display_name'),

  isDeleted: boolean('is_deleted').default(false),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const academicTerms = pgTable(
  'academic_terms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').references(() => organizations.id).notNull(),
    name: text('name').notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    isActive: boolean('is_active').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('idx_terms_org').on(t.orgId)],
);

export const insertOrgSchema = createInsertSchema(organizations, {
  type: z.enum(['chapter', 'council', 'national_hq', 'organization']),
  colorScheme: z.enum(['dark', 'light', 'system']).optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  textColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
}).omit({ id: true, createdAt: true, updatedAt: true, isDeleted: true, deletedAt: true });

export const selectOrgSchema = createSelectSchema(organizations);

export type InsertOrg = z.infer<typeof insertOrgSchema>;
export type Organization = typeof organizations.$inferSelect;
export type AcademicTerm = typeof academicTerms.$inferSelect;
