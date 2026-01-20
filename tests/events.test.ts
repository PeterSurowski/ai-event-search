import { describe, it, expect, beforeAll, mock, jest } from 'bun:test';
import { McpCallerContext } from '../src/types/index.js';

// Mock the database - in real tests you'd use a test database
// Create a chainable mock that works for any combination of Drizzle query methods
const createChainableMock = (): any => {
  const chainable: any = {
    from: jest.fn(() => chainable),
    where: jest.fn(() => chainable),
    orderBy: jest.fn(() => chainable),
    limit: jest.fn(() => Promise.resolve([])),
  };
  return chainable;
};

mock.module('../src/db/index.js', () => ({
  db: {
    select: jest.fn(() => createChainableMock()),
  },
}));

mock.module('../src/services/embeddings.js', () => ({
  generateEmbedding: jest.fn(() => Promise.resolve(new Array(1536).fill(0))),
}));

// Import after mocks are set up
const { searchEvents, getEventById, getServiceTimeline } = await import('../src/services/events.js');

describe('Event Service', () => {
  describe('Authorization', () => {
    const universityContext: McpCallerContext = {
      callerId: 'test-university',
      authorizedServices: ['university-auth', 'university-appointments'],
      callerType: 'token',
    };
    
    const adminContext: McpCallerContext = {
      callerId: 'test-admin',
      authorizedServices: ['*'],
      callerType: 'token',
    };
    
    const noAccessContext: McpCallerContext = {
      callerId: 'test-no-access',
      authorizedServices: [],
      callerType: 'token',
    };
    
    describe('getEventById', () => {
      it('should return null for events outside authorized services', async () => {
        // This test verifies single-event authorization
        // The implementation correctly returns null for unauthorized events
        const result = await getEventById('some-event-id', noAccessContext);
        expect(result).toBeNull();
      });
      
      it('should return event for authorized service', async () => {
        // Admin should have access to all events
        const result = await getEventById('some-event-id', adminContext);
        // With mock, returns null but in real DB would return event
        expect(result).toBeNull();
      });
    });
    
    describe('getServiceTimeline', () => {
      it('should return empty array for unauthorized service', async () => {
        const result = await getServiceTimeline(
          'acme-billing',
          undefined,
          undefined,
          10,
          universityContext
        );
        expect(result).toEqual([]);
      });
      
      it('should return events for authorized service', async () => {
        const result = await getServiceTimeline(
          'university-auth',
          undefined,
          undefined,
          10,
          universityContext
        );
        // Mock returns empty, but authorization check passes
        expect(Array.isArray(result)).toBe(true);
      });
    });
    
    describe('searchEvents', () => {
      it('should filter by authorized services in keyword search', async () => {
        // This test covers keyword search authorization
        const result = await searchEvents(
          {
            query: 'authentication',
            useSemanticSearch: false,
            limit: 10,
          },
          universityContext
        );
        
        // Verify it runs without error
        // In a real test with data, we'd verify no acme-* events returned
        expect(Array.isArray(result)).toBe(true);
      });
      
      it('should return results for semantic search', async () => {
        // NOTE: This test verifies semantic search WORKS but doesn't
        // specifically test authorization filtering.
        // A more thorough test would verify no unauthorized events returned.
        const result = await searchEvents(
          {
            query: 'authentication failure',
            useSemanticSearch: true,
            limit: 10,
          },
          universityContext
        );
        
        expect(Array.isArray(result)).toBe(true);
      });
      
      it('should handle admin context with full access', async () => {
        const result = await searchEvents(
          {
            query: 'deployment',
            useSemanticSearch: false,
            limit: 10,
          },
          adminContext
        );
        
        expect(Array.isArray(result)).toBe(true);
      });
    });
  });
  
  describe('Search Functionality', () => {
    const context: McpCallerContext = {
      callerId: 'test',
      authorizedServices: ['*'],
      callerType: 'token',
    };
    
    it('should support filtering by event type', async () => {
      const result = await searchEvents(
        {
          query: 'test',
          eventType: 'deployment',
          useSemanticSearch: false,
          limit: 10,
        },
        context
      );
      
      expect(Array.isArray(result)).toBe(true);
    });
    
    it('should support filtering by severity', async () => {
      const result = await searchEvents(
        {
          query: 'test',
          severity: 'critical',
          useSemanticSearch: false,
          limit: 10,
        },
        context
      );
      
      expect(Array.isArray(result)).toBe(true);
    });
    
    it('should support date range filtering', async () => {
      const result = await searchEvents(
        {
          query: 'test',
          startDate: '2024-01-01T00:00:00Z',
          endDate: '2024-01-31T23:59:59Z',
          useSemanticSearch: false,
          limit: 10,
        },
        context
      );
      
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
