import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { searchEvents, getEventById, getServiceTimeline } from '../services/events.js';
import { generateImpactSummary } from '../services/impact-summary.js';
import {
  SearchEventsInputSchema,
  GetEventDetailsInputSchema,
  GetServiceTimelineInputSchema,
  GetImpactSummaryInputSchema,
} from '../types/index.js';
import { resolveCallerContext } from './auth.js';

const server = new McpServer({
  name: 'platform-event-intelligence',
  version: '0.1.0',
});

/**
 * Tool: search_events
 * Search platform events using keywords or semantic search
 */
server.tool(
  'search_events',
  'Search platform events by keyword or semantic similarity. Returns events matching the query, filtered by the caller\'s authorized services.',
  SearchEventsInputSchema.shape,
  async (params, extra) => {
    const input = SearchEventsInputSchema.parse(params);
    const context = await resolveCallerContext(extra);
    
    const results = await searchEvents(input, context);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            query: input.query,
            resultCount: results.length,
            searchType: input.useSemanticSearch ? 'semantic' : 'keyword',
            results: results.map(r => ({
              id: r.id,
              service: r.serviceId,
              type: r.eventType,
              severity: r.severity,
              title: r.title,
              description: r.description?.substring(0, 200),
              occurredAt: r.occurredAt.toISOString(),
              ...(r.score !== undefined ? { relevanceScore: r.score.toFixed(3) } : {}),
            })),
          }, null, 2),
        },
      ],
    };
  }
);

/**
 * Tool: get_event_details
 * Get full details of a specific event by ID
 */
server.tool(
  'get_event_details',
  'Get detailed information about a specific event. Returns null if the event does not exist or the caller is not authorized to view it.',
  GetEventDetailsInputSchema.shape,
  async (params, extra) => {
    const input = GetEventDetailsInputSchema.parse(params);
    const context = await resolveCallerContext(extra);
    
    const event = await getEventById(input.eventId, context);
    
    if (!event) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: 'Event not found' }),
          },
        ],
      };
    }
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            id: event.id,
            service: event.serviceId,
            type: event.eventType,
            severity: event.severity,
            title: event.title,
            description: event.description,
            occurredAt: event.occurredAt.toISOString(),
          }, null, 2),
        },
      ],
    };
  }
);

/**
 * Tool: get_service_timeline
 * Get a chronological timeline of events for a specific service
 */
server.tool(
  'get_service_timeline',
  'Get a timeline of events for a specific service. Only returns events if the caller is authorized to view that service.',
  GetServiceTimelineInputSchema.shape,
  async (params, extra) => {
    const input = GetServiceTimelineInputSchema.parse(params);
    const context = await resolveCallerContext(extra);
    
    const results = await getServiceTimeline(
      input.serviceId,
      input.startDate ? new Date(input.startDate) : undefined,
      input.endDate ? new Date(input.endDate) : undefined,
      input.limit,
      context
    );
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            service: input.serviceId,
            eventCount: results.length,
            timeline: results.map(r => ({
              id: r.id,
              type: r.eventType,
              severity: r.severity,
              title: r.title,
              occurredAt: r.occurredAt.toISOString(),
            })),
          }, null, 2),
        },
      ],
    };
  }
);

/**
 * Tool: get_impact_summary
 * Generate a natural language summary of significant events for a service
 */
server.tool(
  'get_impact_summary',
  'Generate an executive summary of significant events and operational impact for a service. Returns a natural language analysis of incidents, deployments, and service health. Only accessible for authorized services.',
  GetImpactSummaryInputSchema.shape,
  async (params, extra) => {
    const input = GetImpactSummaryInputSchema.parse(params);
    const context = await resolveCallerContext(extra);
    
    try {
      const summary = await generateImpactSummary(input, context);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              service: input.serviceId,
              timeRange: {
                start: input.startDate || 'beginning',
                end: input.endDate || 'now',
              },
              summary,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Failed to generate impact summary',
              message: error instanceof Error ? error.message : 'Unknown error',
            }),
          },
        ],
      };
    }
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Platform Event Intelligence MCP server running');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
