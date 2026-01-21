import { getServiceTimeline } from './events.js';
import { McpCallerContext, GetImpactSummaryInput } from '../types/index.js';
import { auditEventAccess } from './audit.js';
import OpenAI from 'openai';

// Lazy initialization to avoid errors when API key is not set
let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

/**
 * Event severity priority for summarization
 * Higher number = more important
 */
const SEVERITY_PRIORITY = {
  critical: 4,
  error: 3,
  warning: 2,
  info: 1,
} as const;

/**
 * Generate a natural language impact summary for a service
 * 
 * This function:
 * 1. Fetches events for the service (authorization enforced by getServiceTimeline)
 * 2. Prioritizes events by severity and recency
 * 3. Generates a natural language summary using LLM
 * 4. Handles context window limits by selecting most significant events
 */
export async function generateImpactSummary(
  input: GetImpactSummaryInput,
  context: McpCallerContext
): Promise<string> {
  // Fetch events for the service (authorization check handled by getServiceTimeline)
  const events = await getServiceTimeline(
    input.serviceId,
    input.startDate ? new Date(input.startDate) : undefined,
    input.endDate ? new Date(input.endDate) : undefined,
    input.maxEvents,
    context
  );

  // If no events, return early
  if (events.length === 0) {
    auditEventAccess(
      context.callerId,
      context.callerName,
      'get_impact_summary',
      0,
      input.serviceId,
      { reason: 'no_events' }
    );
    return `No significant events found for service "${input.serviceId}" in the specified time range.`;
  }

  // Sort events by priority: severity first, then recency
  const prioritizedEvents = [...events].sort((a, b) => {
    const severityDiff = SEVERITY_PRIORITY[b.severity as keyof typeof SEVERITY_PRIORITY] - 
                         SEVERITY_PRIORITY[a.severity as keyof typeof SEVERITY_PRIORITY];
    if (severityDiff !== 0) return severityDiff;
    
    // If same severity, more recent first
    return b.occurredAt.getTime() - a.occurredAt.getTime();
  });

  // Generate summary
  const summary = await generateSummaryWithLLM(input.serviceId, prioritizedEvents);

  // Audit the access
  auditEventAccess(
    context.callerId,
    context.callerName,
    'get_impact_summary',
    events.length,
    input.serviceId,
    {
      startDate: input.startDate,
      endDate: input.endDate,
      eventCount: events.length,
    }
  );

  return summary;
}

/**
 * Generate summary using LLM (OpenAI or mock)
 */
async function generateSummaryWithLLM(
  serviceId: string,
  events: Array<{
    id: string;
    serviceId: string;
    eventType: string;
    severity: string;
    title: string;
    description: string | null;
    occurredAt: Date;
  }>
): Promise<string> {
  // Use mock summary if no API key
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'mock') {
    return generateMockSummary(serviceId, events);
  }

  // Prepare event data for LLM
  const eventSummaries = events.map(e => ({
    type: e.eventType,
    severity: e.severity,
    title: e.title,
    description: e.description?.substring(0, 200), // Truncate to manage token count
    timestamp: e.occurredAt.toISOString(),
  }));

  const prompt = `You are analyzing platform events for the "${serviceId}" service. 
Provide a concise executive summary of the service's operational status and significant events.

Events (most critical first):
${JSON.stringify(eventSummaries, null, 2)}

Generate a 2-3 paragraph summary covering:
1. Overall service health and stability
2. Critical incidents and their impact
3. Notable deployments or configuration changes
4. Any patterns or trends

Keep it professional and actionable for technical stakeholders.`;

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a technical operations analyst specializing in platform reliability and incident analysis.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    return response.choices[0]?.message?.content || generateMockSummary(serviceId, events);
  } catch (error) {
    console.error('Failed to generate LLM summary, falling back to mock:', error);
    return generateMockSummary(serviceId, events);
  }
}

/**
 * Generate a deterministic mock summary for testing/development
 */
function generateMockSummary(
  serviceId: string,
  events: Array<{ eventType: string; severity: string; title: string; occurredAt: Date }>
): string {
  const criticalCount = events.filter(e => e.severity === 'critical').length;
  const errorCount = events.filter(e => e.severity === 'error').length;
  const deploymentCount = events.filter(e => e.eventType === 'deployment').length;
  const incidentCount = events.filter(e => e.eventType === 'incident').length;

  const timeRange = events.length > 0
    ? `from ${events[events.length - 1]!.occurredAt.toLocaleDateString()} to ${events[0]!.occurredAt.toLocaleDateString()}`
    : 'in the specified period';

  let summary = `Impact Summary for ${serviceId} (${timeRange}):\n\n`;

  // Overall health assessment
  if (criticalCount > 0) {
    summary += `⚠️ Service experienced ${criticalCount} critical event(s) requiring immediate attention. `;
  } else if (errorCount > 0) {
    summary += `Service had ${errorCount} error-level event(s) that may impact operations. `;
  } else {
    summary += `Service operating normally with ${events.length} informational event(s). `;
  }

  // Incident summary
  if (incidentCount > 0) {
    summary += `${incidentCount} incident(s) detected. `;
    const latestIncident = events.find(e => e.eventType === 'incident');
    if (latestIncident) {
      summary += `Most recent: "${latestIncident.title}". `;
    }
  }

  // Deployment activity
  if (deploymentCount > 0) {
    summary += `\n\n${deploymentCount} deployment(s) occurred during this period. `;
  }

  summary += `\n\nTotal events analyzed: ${events.length}. `;
  summary += `Most significant event: "${events[0]!.title}" (${events[0]!.severity}).`;

  return summary;
}
