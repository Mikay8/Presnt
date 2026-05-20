import { boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email').unique().notNull(),
  phone: text('phone'),
  avatarUrl: text('avatar_url'),
  graduationYear: text('graduation_year'),
  major: text('major'),
  bio: text('bio'),
  pushToken: text('push_token'),
  notificationPrefs: jsonb('notification_prefs').default({}),

  isSuperuser: boolean('is_superuser').default(false),
  superuserSince: timestamp('superuser_since', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const insertProfileSchema = createInsertSchema(profiles).omit({
  isSuperuser: true,
  superuserSince: true,
  createdAt: true,
  updatedAt: true,
});

export const selectProfileSchema = createSelectSchema(profiles).omit({ isSuperuser: true, superuserSince: true });

export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profiles.$inferSelect;
