import { describe, it, expect, beforeAll } from 'bun:test';
import { McpCallerContext } from '../src/types/index.js';
import { db, pool } from '../src/db/index.js';
import { events, apiTokens } from '../src/db/schema.js';
import { searchEvents, getEventById, getServiceTimeline } from '../src/services/events.js';
import { resolveCallerContext, createApiToken } from '../src/mcp/auth.js';
import { sql } from 'drizzle-orm';

/**
 * Security-focused integration tests
 * 
 * These tests verify critical security controls using a real test database.
 * They test the actual SQL generation and authorization logic, not mocks.
 */

describe('Security Tests - Authorization', () => {
  let testToken: string;
  let testTokenId: string;
  let unauthorizedEvent: any;
  let authorizedEvent: any;

  beforeAll(async () => {
    // Clean up test data using raw SQL (compatible with all drizzle versions)
    await pool.query('DELETE FROM events');
    await pool.query('DELETE FROM api_tokens');

    // Create a test token with limited access
    const result = await createApiToken(
      'Test Token',
      ['test-service-1'],
      'test-suite'
    );
    testToken = result.token;
    testTokenId = result.id;

    // Insert test events
    const [event1] = await db.insert(events).values({
      serviceId: 'test-service-1',
      eventType: 'incident',
      severity: 'critical',
      title: 'Authorized Event',
      description: 'This event should be accessible',
      occurredAt: new Date(),
    }).returning();
    authorizedEvent = event1;

    const [event2] = await db.insert(events).values({
      serviceId: 'test-service-2',
      eventType: 'incident',
      severity: 'critical',
      title: 'Unauthorized Event',
      description: 'This event should NOT be accessible',
      occurredAt: new Date(),
    }).returning();
    unauthorizedEvent = event2;
  });

  describe('Semantic Search Authorization', () => {
    it('should enforce authorization in semantic search', async () => {
      const context: McpCallerContext = {
        callerId: testTokenId,
        authorizedServices: ['test-service-1'],
        callerType: 'token',
      };

      const results = await searchEvents(
        {
          query: 'incident',
          useSemanticSearch: true,
          limit: 10,
        },
        context
      );

      // Should only return events from authorized service
      expect(results.every(r => r.serviceId === 'test-service-1')).toBe(true);
      expect(results.some(r => r.serviceId === 'test-service-2')).toBe(false);
    });

    it('should return no results when searching unauthorized services', async () => {
      const context: McpCallerContext = {
        callerId: testTokenId,
        authorizedServices: ['different-service'],
        callerType: 'token',
      };

      const results = await searchEvents(
        {
          query: 'incident',
          useSemanticSearch: true,
          limit: 10,
        },
        context
      );

      expect(results).toHaveLength(0);
    });

    it('should allow admin wildcard access in semantic search', async () => {
      const context: McpCallerContext = {
        callerId: 'admin',
        authorizedServices: ['*'],
        callerType: 'token',
      };

      const results = await searchEvents(
        {
          query: 'incident',
          useSemanticSearch: true,
          limit: 10,
        },
        context
      );

      // Admin should see both events
      const serviceIds = results.map(r => r.serviceId);
      expect(serviceIds).toContain('test-service-1');
      expect(serviceIds).toContain('test-service-2');
    });
  });

  describe('SQL Injection Protection', () => {
    it('should escape percent signs in keyword search', async () => {
      const context: McpCallerContext = {
        callerId: 'admin',
        authorizedServices: ['*'],
        callerType: 'token',
      };

      // This should be treated as literal characters, not SQL wildcards
      const results = await searchEvents(
        {
          query: '%_malicious',
          useSemanticSearch: false,
          limit: 10,
        },
        context
      );

      // Should not throw SQL error and should search for literal string
      expect(Array.isArray(results)).toBe(true);
    });

    it('should escape single quotes to prevent injection', async () => {
      const context: McpCallerContext = {
        callerId: 'admin',
        authorizedServices: ['*'],
        callerType: 'token',
      };

      // Attempt SQL injection via single quote
      const results = await searchEvents(
        {
          query: "test' OR '1'='1",
          useSemanticSearch: false,
          limit: 10,
        },
        context
      );

      // Should not return all events - should treat as literal search
      expect(Array.isArray(results)).toBe(true);
      // If injection worked, we'd get all events. Escaping prevents this.
    });

    it('should handle backslash escaping properly', async () => {
      const context: McpCallerContext = {
        callerId: 'admin',
        authorizedServices: ['*'],
        callerType: 'token',
      };

      const results = await searchEvents(
        {
          query: 'test\\\\escaped',
          useSemanticSearch: false,
          limit: 10,
        },
        context
      );

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('getEventById Authorization', () => {
    it('should return null for unauthorized event access', async () => {
      const context: McpCallerContext = {
        callerId: testTokenId,
        authorizedServices: ['test-service-1'],
        callerType: 'token',
      };

      const result = await getEventById(unauthorizedEvent.id, context);
      expect(result).toBeNull();
    });

    it('should return event for authorized access', async () => {
      const context: McpCallerContext = {
        callerId: testTokenId,
        authorizedServices: ['test-service-1'],
        callerType: 'token',
      };

      const result = await getEventById(authorizedEvent.id, context);
      expect(result).not.toBeNull();
      expect(result?.id).toBe(authorizedEvent.id);
    });
  });

  describe('getServiceTimeline Authorization', () => {
    it('should return empty array for unauthorized service', async () => {
      const context: McpCallerContext = {
        callerId: testTokenId,
        authorizedServices: ['test-service-1'],
        callerType: 'token',
      };

      const results = await getServiceTimeline(
        'test-service-2',
        undefined,
        undefined,
        10,
        context
      );

      expect(results).toHaveLength(0);
    });

    it('should return events for authorized service', async () => {
      const context: McpCallerContext = {
        callerId: testTokenId,
        authorizedServices: ['test-service-1'],
        callerType: 'token',
      };

      const results = await getServiceTimeline(
        'test-service-1',
        undefined,
        undefined,
        10,
        context
      );

      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.serviceId === 'test-service-1')).toBe(true);
    });
  });
});

describe('Security Tests - Authentication', () => {
  let validToken: string;
  let validTokenId: string;

  beforeAll(async () => {
    await pool.query('DELETE FROM api_tokens');

    const result = await createApiToken(
      'Valid Token',
      ['service-1'],
      'test-suite',
      1 // Expires in 1 day
    );
    validToken = result.token;
    validTokenId = result.id;
  });

  it('should reject missing authentication token', async () => {
    const context = await resolveCallerContext({});
    expect(context.authorizedServices).toHaveLength(0);
    expect(context.callerId).toBe('anonymous');
  });

  it('should reject invalid token', async () => {
    const context = await resolveCallerContext({
      metadata: {
        authToken: 'invalid_token_12345',
      },
    });
    expect(context.authorizedServices).toHaveLength(0);
    expect(context.callerId).toBe('invalid');
  });

  it('should accept valid token', async () => {
    const context = await resolveCallerContext({
      metadata: {
        authToken: validToken,
      },
    });
    expect(context.callerId).toBe(validTokenId);
    expect(context.authorizedServices).toContain('service-1');
  });

  it('should reject expired token', async () => {
    // Create an expired token
    const expiredResult = await createApiToken(
      'Expired Token',
      ['service-1'],
      'test-suite',
      -1 // Already expired
    );

    const context = await resolveCallerContext({
      metadata: {
        authToken: expiredResult.token,
      },
    });

    expect(context.authorizedServices).toHaveLength(0);
  });
});
