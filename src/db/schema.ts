import { pgTable, text, timestamp, uuid, vector, jsonb, index } from 'drizzle-orm/pg-core';

/**
 * Platform events from various sources (deployments, incidents, config changes, etc.)
 * 
 * IMPORTANT: Events are scoped to services. Authorization checks must ensure
 * callers can only access events for services they're authorized to view.
 */
export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // The service this event belongs to - critical for authorization
  serviceId: text('service_id').notNull(),
  
  // Event classification
  eventType: text('event_type').notNull(), // 'deployment', 'incident', 'config_change', 'alert', 'rollback'
  severity: text('severity').notNull().default('info'), // 'info', 'warning', 'error', 'critical'
  
  // Event content
  title: text('title').notNull(),
  description: text('description'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  
  // Vector embedding for semantic search
  embedding: vector('embedding', { dimensions: 1536 }),
  
  // Correlation support
  correlationId: text('correlation_id'),
  parentEventId: uuid('parent_event_id'),
  
  // Timestamps
  occurredAt: timestamp('occurred_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  serviceIdIdx: index('events_service_id_idx').on(table.serviceId),
  eventTypeIdx: index('events_event_type_idx').on(table.eventType),
  occurredAtIdx: index('events_occurred_at_idx').on(table.occurredAt),
  correlationIdIdx: index('events_correlation_id_idx').on(table.correlationId),
}));

/**
 * Services registry - tracks known services and their ownership
 */
export const services = pgTable('services', {
  id: text('id').primaryKey(), // e.g., 'auth-service', 'appointment-api'
  name: text('name').notNull(),
  description: text('description'),
  teamId: text('team_id').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/**
 * API tokens for MCP and API access
 * Each token is scoped to specific services
 */
export const apiTokens = pgTable('api_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: text('token_hash').notNull().unique(),
  name: text('name').notNull(),
  
  // Authorization scope - which services this token can access
  // Empty array means no access, '*' means all services (admin)
  authorizedServices: text('authorized_services').array().notNull(),
  
  // Token metadata
  createdBy: text('created_by').notNull(),
  expiresAt: timestamp('expires_at'),
  lastUsedAt: timestamp('last_used_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Service = typeof services.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;
