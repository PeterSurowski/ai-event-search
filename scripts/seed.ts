import { pool } from '../src/db/index.js';
import { createHash } from 'crypto';
import { generateEmbedding } from '../src/services/embeddings.js';

// Predefined tokens for testing
// In a real scenario, these would be generated securely
const TEST_TOKENS = {
  // Admin token - full access
  admin: 'pei_admin_token_for_testing_only',
  
  // University Health System token - access to university-* services only
  universityHealth: 'pei_university_health_token',
  
  // Acme Corp token - access to acme-* services only  
  acmeCorp: 'pei_acme_corp_token',
};

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function seed() {
  console.log('Seeding database...');
  
  const client = await pool.connect();
  
  try {
    // Clear existing data
    await client.query('DELETE FROM events');
    await client.query('DELETE FROM api_tokens');
    await client.query('DELETE FROM services');
    
    // Create services for different tenants
    const services = [
      // University Health System services
      { id: 'university-auth', name: 'University Auth Service', teamId: 'university-platform', description: 'Authentication for University Health System' },
      { id: 'university-appointments', name: 'University Appointments', teamId: 'university-scheduling', description: 'Appointment scheduling for university clinics' },
      { id: 'university-ehr', name: 'University EHR Integration', teamId: 'university-integrations', description: 'Electronic health records integration' },
      
      // Acme Corp services
      { id: 'acme-portal', name: 'Acme Patient Portal', teamId: 'acme-platform', description: 'Patient portal for Acme Corp' },
      { id: 'acme-billing', name: 'Acme Billing Service', teamId: 'acme-finance', description: 'Billing and payments for Acme' },
      
      // Shared/core services
      { id: 'core-gateway', name: 'API Gateway', teamId: 'platform', description: 'Core API gateway' },
    ];
    
    for (const service of services) {
      await client.query(
        'INSERT INTO services (id, name, team_id, description) VALUES ($1, $2, $3, $4)',
        [service.id, service.name, service.teamId, service.description]
      );
    }
    console.log(`Created ${services.length} services`);
    
    // Create API tokens with different authorization scopes
    const tokens = [
      {
        token: TEST_TOKENS.admin,
        name: 'Admin Token',
        authorizedServices: ['*'],
        createdBy: 'system',
      },
      {
        token: TEST_TOKENS.universityHealth,
        name: 'University Health System',
        authorizedServices: ['university-auth', 'university-appointments', 'university-ehr', 'core-gateway'],
        createdBy: 'admin',
      },
      {
        token: TEST_TOKENS.acmeCorp,
        name: 'Acme Corp',
        authorizedServices: ['acme-portal', 'acme-billing', 'core-gateway'],
        createdBy: 'admin',
      },
    ];
    
    for (const t of tokens) {
      await client.query(
        'INSERT INTO api_tokens (token_hash, name, authorized_services, created_by) VALUES ($1, $2, $3, $4)',
        [hashToken(t.token), t.name, t.authorizedServices, t.createdBy]
      );
    }
    console.log(`Created ${tokens.length} API tokens`);
    
    // Create events for each service
    // Mix of deployments, incidents, config changes
    const events = [
      // University Health System events
      {
        serviceId: 'university-auth',
        eventType: 'deployment',
        severity: 'info',
        title: 'Deployed v2.4.1 - SAML SSO improvements',
        description: 'Updated SAML integration to support new identity provider requirements. Includes improved session handling and logout flow.',
        occurredAt: new Date('2024-01-15T10:30:00Z'),
      },
      {
        serviceId: 'university-auth',
        eventType: 'incident',
        severity: 'critical',
        title: 'Authentication outage affecting student login',
        description: 'Students unable to authenticate due to expired SSL certificate on identity provider connection. Affected approximately 5,000 users over 45 minutes.',
        occurredAt: new Date('2024-01-16T14:22:00Z'),
      },
      {
        serviceId: 'university-auth',
        eventType: 'rollback',
        severity: 'warning',
        title: 'Rolled back to v2.4.0',
        description: 'Emergency rollback due to authentication outage. Root cause identified as misconfigured certificate rotation.',
        occurredAt: new Date('2024-01-16T15:07:00Z'),
      },
      {
        serviceId: 'university-appointments',
        eventType: 'deployment',
        severity: 'info',
        title: 'Deployed appointment reminder notifications',
        description: 'New feature: SMS and email reminders 24 hours before scheduled appointments. Integrated with Twilio and SendGrid.',
        occurredAt: new Date('2024-01-17T09:00:00Z'),
      },
      {
        serviceId: 'university-ehr',
        eventType: 'config_change',
        severity: 'info',
        title: 'Updated HL7 FHIR endpoint configuration',
        description: 'Changed EHR integration endpoint to new FHIR R4 compliant API. Backward compatibility maintained for legacy systems.',
        occurredAt: new Date('2024-01-18T11:45:00Z'),
      },
      
      // Acme Corp events - THESE SHOULD NOT BE VISIBLE TO UNIVERSITY HEALTH
      {
        serviceId: 'acme-portal',
        eventType: 'incident',
        severity: 'error',
        title: 'Patient portal performance degradation',
        description: 'Response times increased to 8+ seconds due to database connection pool exhaustion. Affected 2,000 concurrent users during peak hours.',
        occurredAt: new Date('2024-01-15T16:30:00Z'),
      },
      {
        serviceId: 'acme-portal',
        eventType: 'deployment',
        severity: 'info',
        title: 'Deployed connection pool optimization',
        description: 'Increased database connection pool from 50 to 200 connections. Added connection timeout and retry logic.',
        occurredAt: new Date('2024-01-15T18:00:00Z'),
      },
      {
        serviceId: 'acme-billing',
        eventType: 'incident',
        severity: 'critical',
        title: 'Payment processing failure - Stripe webhook misconfiguration',
        description: 'Stripe webhooks failing validation due to incorrect signing secret after key rotation. Approximately 150 payments affected, all recovered.',
        occurredAt: new Date('2024-01-17T13:15:00Z'),
      },
      {
        serviceId: 'acme-billing',
        eventType: 'config_change',
        severity: 'warning',
        title: 'Updated Stripe webhook signing secret',
        description: 'Rotated Stripe webhook signing secret and updated configuration. Verified webhook signature validation working correctly.',
        occurredAt: new Date('2024-01-17T14:30:00Z'),
      },
      
      // Core gateway events - visible to both
      {
        serviceId: 'core-gateway',
        eventType: 'deployment',
        severity: 'info',
        title: 'Gateway v3.2.0 - Rate limiting improvements',
        description: 'Enhanced rate limiting with per-tenant quotas. Added support for burst allowances and graceful degradation.',
        occurredAt: new Date('2024-01-14T08:00:00Z'),
      },
      {
        serviceId: 'core-gateway',
        eventType: 'alert',
        severity: 'warning',
        title: 'Elevated error rates on /api/v2/appointments endpoint',
        description: 'Error rate exceeded 5% threshold for 10 minutes. Automatic scaling triggered. Root cause: upstream service cold start latency.',
        occurredAt: new Date('2024-01-16T09:45:00Z'),
      },
    ];
    
    console.log('Generating embeddings and inserting events...');
    
    for (const event of events) {
      // Generate embedding from title + description
      const textForEmbedding = `${event.title} ${event.description}`;
      const embedding = await generateEmbedding(textForEmbedding);
      
      await client.query(
        `INSERT INTO events (service_id, event_type, severity, title, description, embedding, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          event.serviceId,
          event.eventType,
          event.severity,
          event.title,
          event.description,
          JSON.stringify(embedding),
          event.occurredAt,
        ]
      );
    }
    
    console.log(`Created ${events.length} events with embeddings`);
    
    console.log('\n=== Test Tokens ===');
    console.log('Admin (full access):');
    console.log(`  PEI_AUTH_TOKEN=${TEST_TOKENS.admin}`);
    console.log('\nUniversity Health System (university-* + core-gateway):');
    console.log(`  PEI_AUTH_TOKEN=${TEST_TOKENS.universityHealth}`);
    console.log('\nAcme Corp (acme-* + core-gateway):');
    console.log(`  PEI_AUTH_TOKEN=${TEST_TOKENS.acmeCorp}`);
    
    console.log('\nSeeding completed successfully!');
    
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
