import { z } from 'zod';

/**
 * MCP caller context - passed with each tool invocation
 * Contains authorization information for the current caller
 */
export interface McpCallerContext {
  // Unique identifier for the caller (token ID or user ID)
  callerId: string;
  
  // Services this caller is authorized to access
  // If includes '*', caller has access to all services (admin)
  authorizedServices: string[];
  
  // Additional metadata about the caller
  callerName?: string;
  callerType: 'token' | 'user';
}

/**
 * Check if a caller is authorized to access a specific service
 */
export function isAuthorizedForService(
  context: McpCallerContext,
  serviceId: string
): boolean {
  if (context.authorizedServices.includes('*')) {
    return true;
  }
  return context.authorizedServices.includes(serviceId);
}

/**
 * Get the SQL filter clause for authorized services
 * Returns the list of service IDs the caller can access
 */
export function getAuthorizedServiceFilter(context: McpCallerContext): string[] | '*' {
  if (context.authorizedServices.includes('*')) {
    return '*';
  }
  return context.authorizedServices;
}

// Zod schemas for tool inputs
export const SearchEventsInputSchema = z.object({
  query: z.string().describe('Search query - can be keywords or natural language'),
  serviceId: z.string().optional().describe('Filter to a specific service'),
  eventType: z.enum(['deployment', 'incident', 'config_change', 'alert', 'rollback']).optional(),
  severity: z.enum(['info', 'warning', 'error', 'critical']).optional(),
  startDate: z.string().optional().describe('ISO date string for range start'),
  endDate: z.string().optional().describe('ISO date string for range end'),
  limit: z.number().min(1).max(50).default(10),
  useSemanticSearch: z.boolean().default(true).describe('Use vector similarity search'),
});

export type SearchEventsInput = z.infer<typeof SearchEventsInputSchema>;

export const GetEventDetailsInputSchema = z.object({
  eventId: z.string().uuid().describe('The event ID to retrieve'),
});

export type GetEventDetailsInput = z.infer<typeof GetEventDetailsInputSchema>;

export const GetServiceTimelineInputSchema = z.object({
  serviceId: z.string().describe('The service to get timeline for'),
  startDate: z.string().optional().describe('ISO date string for range start'),
  endDate: z.string().optional().describe('ISO date string for range end'),
  limit: z.number().min(1).max(100).default(20),
});

export type GetServiceTimelineInput = z.infer<typeof GetServiceTimelineInputSchema>;
