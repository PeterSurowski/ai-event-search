import { db } from '../db/index.js';
import { events } from '../db/schema.js';
import { eq, and, gte, lte, inArray, desc, sql, or, ilike } from 'drizzle-orm';
import { McpCallerContext, SearchEventsInput, getAuthorizedServiceFilter } from '../types/index.js';
import { generateEmbedding } from './embeddings.js';

export interface SearchResult {
  id: string;
  serviceId: string;
  eventType: string;
  severity: string;
  title: string;
  description: string | null;
  occurredAt: Date;
  score?: number;
}

/**
 * Search events using keyword matching
 * Properly scoped to caller's authorized services
 */
async function keywordSearch(
  input: SearchEventsInput,
  context: McpCallerContext
): Promise<SearchResult[]> {
  const conditions = [];
  
  // Authorization filter - critical for data isolation
  const authorizedFilter = getAuthorizedServiceFilter(context);
  if (authorizedFilter !== '*') {
    conditions.push(inArray(events.serviceId, authorizedFilter));
  }
  
  // Apply optional filters
  if (input.serviceId) {
    conditions.push(eq(events.serviceId, input.serviceId));
  }
  if (input.eventType) {
    conditions.push(eq(events.eventType, input.eventType));
  }
  if (input.severity) {
    conditions.push(eq(events.severity, input.severity));
  }
  if (input.startDate) {
    conditions.push(gte(events.occurredAt, new Date(input.startDate)));
  }
  if (input.endDate) {
    conditions.push(lte(events.occurredAt, new Date(input.endDate)));
  }
  
  // Keyword matching on title and description
  const keywordCondition = or(
    ilike(events.title, `%${input.query}%`),
    ilike(events.description, `%${input.query}%`)
  );
  conditions.push(keywordCondition);
  
  const results = await db
    .select({
      id: events.id,
      serviceId: events.serviceId,
      eventType: events.eventType,
      severity: events.severity,
      title: events.title,
      description: events.description,
      occurredAt: events.occurredAt,
    })
    .from(events)
    .where(and(...conditions))
    .orderBy(desc(events.occurredAt))
    .limit(input.limit);
  
  return results;
}

/**
 * Search events using vector similarity (semantic search)
 * Uses pgvector for embedding-based retrieval
 */
async function semanticSearch(
  input: SearchEventsInput,
  _context: McpCallerContext
): Promise<SearchResult[]> {
  // Generate embedding for the search query
  const queryEmbedding = await generateEmbedding(input.query);
  
  // Build the base query with vector similarity
  // Using cosine distance for semantic matching
  const similarityQuery = sql`1 - (${events.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector)`;
  
  const conditions = [];
  
  // Apply optional filters
  if (input.serviceId) {
    conditions.push(eq(events.serviceId, input.serviceId));
  }
  if (input.eventType) {
    conditions.push(eq(events.eventType, input.eventType));
  }
  if (input.severity) {
    conditions.push(eq(events.severity, input.severity));
  }
  if (input.startDate) {
    conditions.push(gte(events.occurredAt, new Date(input.startDate)));
  }
  if (input.endDate) {
    conditions.push(lte(events.occurredAt, new Date(input.endDate)));
  }
  
  // Only include events that have embeddings
  conditions.push(sql`${events.embedding} IS NOT NULL`);
  
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  
  const results = await db
    .select({
      id: events.id,
      serviceId: events.serviceId,
      eventType: events.eventType,
      severity: events.severity,
      title: events.title,
      description: events.description,
      occurredAt: events.occurredAt,
      score: similarityQuery.as('similarity_score'),
    })
    .from(events)
    .where(whereClause)
    .orderBy(sql`${events.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`)
    .limit(input.limit);
  
  return results.map(r => ({
    ...r,
    score: typeof r.score === 'number' ? r.score : undefined,
  }));
}

/**
 * Main search function - routes to keyword or semantic search
 */
export async function searchEvents(
  input: SearchEventsInput,
  context: McpCallerContext
): Promise<SearchResult[]> {
  if (input.useSemanticSearch) {
    return semanticSearch(input, context);
  }
  return keywordSearch(input, context);
}

/**
 * Get a single event by ID
 * Enforces authorization check
 */
export async function getEventById(
  eventId: string,
  context: McpCallerContext
): Promise<SearchResult | null> {
  const result = await db
    .select({
      id: events.id,
      serviceId: events.serviceId,
      eventType: events.eventType,
      severity: events.severity,
      title: events.title,
      description: events.description,
      occurredAt: events.occurredAt,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  
  if (result.length === 0) {
    return null;
  }
  
  const event = result[0]!;
  
  // Authorization check
  const authorizedFilter = getAuthorizedServiceFilter(context);
  if (authorizedFilter !== '*' && !authorizedFilter.includes(event.serviceId)) {
    // Return null as if the event doesn't exist
    // Don't leak that an event exists but is unauthorized
    return null;
  }
  
  return event;
}

/**
 * Get timeline of events for a specific service
 * Enforces authorization check
 */
export async function getServiceTimeline(
  serviceId: string,
  startDate: Date | undefined,
  endDate: Date | undefined,
  limit: number,
  context: McpCallerContext
): Promise<SearchResult[]> {
  // Authorization check first
  const authorizedFilter = getAuthorizedServiceFilter(context);
  if (authorizedFilter !== '*' && !authorizedFilter.includes(serviceId)) {
    return [];
  }
  
  const conditions = [eq(events.serviceId, serviceId)];
  
  if (startDate) {
    conditions.push(gte(events.occurredAt, startDate));
  }
  if (endDate) {
    conditions.push(lte(events.occurredAt, endDate));
  }
  
  const results = await db
    .select({
      id: events.id,
      serviceId: events.serviceId,
      eventType: events.eventType,
      severity: events.severity,
      title: events.title,
      description: events.description,
      occurredAt: events.occurredAt,
    })
    .from(events)
    .where(and(...conditions))
    .orderBy(desc(events.occurredAt))
    .limit(limit);
  
  return results;
}
