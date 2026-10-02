import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const mapState = sqliteTable('map_state', {
  id: integer('id').primaryKey(),
  version: integer('version').notNull(),
  projectsJson: text('projects_json').notNull(),
  updatedAt: text('updated_at').notNull(),
});
