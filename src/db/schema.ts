import {
    index,
    integer,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core';

// Test schema - a simple items table
export const items = pgTable(
    'items',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        name: text('name').notNull(),
        description: text('description'),
        quantity: integer('quantity').notNull().default(0),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        nameIdx: index('items_name_idx').on(table.name),
        createdAtIdx: index('items_created_at_idx').on(table.createdAt),
    })
);

