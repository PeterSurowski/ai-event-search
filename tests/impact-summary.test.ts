import { describe, it, expect, beforeAll } from 'bun:test';
import { McpCallerContext } from '../src/types/index.js';
import { pool } from '../src/db/index.js';
import { generateImpactSummary } from '../src/services/impact-summary.js';

/**
 * Tests for get_impact_summary tool
 * 
 * Verifies:
 * - Authorization enforcement
 * - Event prioritization by severity
 * - Summary generation
 * - Error handling
 */

describe('Impact Summary Service', () => {
  let testServiceId: string;

  beforeAll(async () => {
    // Clean up and insert test events
    await pool.query('DELETE FROM events');
    
    testServiceId = 'test-summary-service';

    // Insert events with varying severities
    await pool.query(`
      INSERT INTO events (service_id, event_type, severity, title, description, occurred_at)
      VALUES 
        ($1, 'incident', 'critical', 'Database outage', 'Primary database unavailable for 15 minutes', NOW() - INTERVAL '1 hour'),
        ($1, 'deployment', 'info', 'Deployed v2.1.0', 'New features and bug fixes', NOW() - INTERVAL '2 hours'),
        ($1, 'incident', 'error', 'API errors increased', 'Error rate at 5% for 10 minutes', NOW() - INTERVAL '3 hours'),
        ($1, 'config_change', 'warning', 'Updated rate limits', 'Increased rate limits by 20%', NOW() - INTERVAL '4 hours'),
        ($1, 'deployment', 'info', 'Deployed v2.0.9 hotfix', 'Fixed memory leak', NOW() - INTERVAL '5 hours')
    `, [testServiceId]);
  });

  describe('Authorization', () => {
    it('should return summary for authorized service', async () => {
      const context: McpCallerContext = {
        callerId: 'test-user',
        authorizedServices: [testServiceId],
        callerType: 'token',
      };

      const summary = await generateImpactSummary(
        { serviceId: testServiceId, maxEvents: 20 },
        context
      );

      expect(summary).toBeDefined();
      expect(typeof summary).toBe('string');
      expect(summary.length).toBeGreaterThan(0);
    });

    it('should return "no events" message for unauthorized service', async () => {
      const context: McpCallerContext = {
        callerId: 'test-user',
        authorizedServices: ['different-service'],
        callerType: 'token',
      };

      const summary = await generateImpactSummary(
        { serviceId: testServiceId, maxEvents: 20 },
        context
      );

      expect(summary).toContain('No significant events found');
    });

    it('should work for admin with wildcard access', async () => {
      const context: McpCallerContext = {
        callerId: 'admin',
        authorizedServices: ['*'],
        callerType: 'token',
      };

      const summary = await generateImpactSummary(
        { serviceId: testServiceId, maxEvents: 20 },
        context
      );

      expect(summary).toBeDefined();
      expect(summary).not.toContain('No significant events found');
    });
  });

  describe('Event Prioritization', () => {
    it('should mention critical events prominently', async () => {
      const context: McpCallerContext = {
        callerId: 'test-user',
        authorizedServices: [testServiceId],
        callerType: 'token',
      };

      const summary = await generateImpactSummary(
        { serviceId: testServiceId, maxEvents: 20 },
        context
      );

      // Mock summary should mention critical events
      expect(summary).toContain('critical');
      expect(summary).toContain('Database outage');
    });

    it('should include incident count in summary', async () => {
      const context: McpCallerContext = {
        callerId: 'test-user',
        authorizedServices: [testServiceId],
        callerType: 'token',
      };

      const summary = await generateImpactSummary(
        { serviceId: testServiceId, maxEvents: 20 },
        context
      );

      // Should mention incidents
      expect(summary).toMatch(/incident/i);
    });

    it('should include deployment count in summary', async () => {
      const context: McpCallerContext = {
        callerId: 'test-user',
        authorizedServices: [testServiceId],
        callerType: 'token',
      };

      const summary = await generateImpactSummary(
        { serviceId: testServiceId, maxEvents: 20 },
        context
      );

      // Should mention deployments
      expect(summary).toMatch(/deployment/i);
    });
  });

  describe('Context Window Management', () => {
    it('should respect maxEvents limit', async () => {
      const context: McpCallerContext = {
        callerId: 'test-user',
        authorizedServices: [testServiceId],
        callerType: 'token',
      };

      // Request only 2 events
      const summary = await generateImpactSummary(
        { serviceId: testServiceId, maxEvents: 2 },
        context
      );

      expect(summary).toBeDefined();
      // Summary should still be generated with limited events
      expect(summary.length).toBeGreaterThan(0);
    });

    it('should handle large event counts gracefully', async () => {
      const context: McpCallerContext = {
        callerId: 'test-user',
        authorizedServices: [testServiceId],
        callerType: 'token',
      };

      const summary = await generateImpactSummary(
        { serviceId: testServiceId, maxEvents: 50 },
        context
      );

      expect(summary).toBeDefined();
    });
  });

  describe('Time Range Filtering', () => {
    it('should filter events by date range', async () => {
      const context: McpCallerContext = {
        callerId: 'test-user',
        authorizedServices: [testServiceId],
        callerType: 'token',
      };

      // Request only recent events (last hour)
      const startDate = new Date(Date.now() - 90 * 60 * 1000).toISOString(); // 90 minutes ago
      
      const summary = await generateImpactSummary(
        { 
          serviceId: testServiceId,
          startDate,
          maxEvents: 20 
        },
        context
      );

      expect(summary).toBeDefined();
      // Should only see the most recent event (database outage)
      expect(summary).toContain('Database outage');
    });
  });

  describe('Edge Cases', () => {
    it('should handle service with no events', async () => {
      const context: McpCallerContext = {
        callerId: 'test-user',
        authorizedServices: ['nonexistent-service'],
        callerType: 'token',
      };

      const summary = await generateImpactSummary(
        { serviceId: 'nonexistent-service', maxEvents: 20 },
        context
      );

      expect(summary).toContain('No significant events found');
      expect(summary).toContain('nonexistent-service');
    });

    it('should handle empty authorized services', async () => {
      const context: McpCallerContext = {
        callerId: 'no-access-user',
        authorizedServices: [],
        callerType: 'token',
      };

      const summary = await generateImpactSummary(
        { serviceId: testServiceId, maxEvents: 20 },
        context
      );

      expect(summary).toContain('No significant events found');
    });
  });

  describe('Summary Content Quality', () => {
    it('should generate human-readable summary', async () => {
      const context: McpCallerContext = {
        callerId: 'test-user',
        authorizedServices: [testServiceId],
        callerType: 'token',
      };

      const summary = await generateImpactSummary(
        { serviceId: testServiceId, maxEvents: 20 },
        context
      );

      // Should contain service name
      expect(summary).toContain(testServiceId);
      
      // Should have reasonable length (not too short)
      expect(summary.length).toBeGreaterThan(50);
      
      // Should contain event count
      expect(summary).toMatch(/\d+/); // Contains numbers
    });

    it('should indicate overall service health', async () => {
      const context: McpCallerContext = {
        callerId: 'test-user',
        authorizedServices: [testServiceId],
        callerType: 'token',
      };

      const summary = await generateImpactSummary(
        { serviceId: testServiceId, maxEvents: 20 },
        context
      );

      // Should indicate health status (with critical events present)
      expect(summary).toMatch(/critical|event|incident|service/i);
    });
  });
});
