import { pgTable, text, timestamp, serial, integer, jsonb } from 'drizzle-orm/pg-core';

export const profiles = pgTable('profiles', {
  id: serial().primaryKey(),
  auth0Id: text('auth0_id').notNull().unique(),
  username: text('username').notNull(),
  about: text('about').default(''),
  image: text('image').default(''),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const builds = pgTable('builds', {
  id: serial().primaryKey(),
  profileId: integer('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  data: jsonb('data').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
