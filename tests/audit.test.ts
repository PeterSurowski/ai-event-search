import { describe, it, expect, mock, spyOn } from 'bun:test';
import {
  auditLog,
  auditEventAccess,
  auditAuthFailure,
  auditAuthorizationDenied,
  auditAuthSuccess,
} from '../src/services/audit.js';

/**
 * Tests for audit logging functionality
 * Verifies HIPAA-compliant audit trails are generated
 */

describe('Audit Logging', () => {
  describe('auditLog', () => {
    it('should log structured JSON to stderr', () => {
      const consoleErrorSpy = spyOn(console, 'error');

      auditLog({
        level: 'INFO',
        action: 'test_action',
        callerId: 'test-caller',
        success: true,
        message: 'Test message',
      });

      expect(consoleErrorSpy).toHaveBeenCalled();
      const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);

      expect(loggedData.type).toBe('AUDIT');
      expect(loggedData.level).toBe('INFO');
      expect(loggedData.action).toBe('test_action');
      expect(loggedData.callerId).toBe('test-caller');
      expect(loggedData.success).toBe(true);
      expect(loggedData.timestamp).toBeDefined();
      expect(new Date(loggedData.timestamp).toISOString()).toBe(loggedData.timestamp);

      consoleErrorSpy.mockRestore();
    });

    it('should include optional metadata', () => {
      const consoleErrorSpy = spyOn(console, 'error');

      auditLog({
        level: 'WARNING',
        action: 'test_action',
        callerId: 'test-caller',
        success: false,
        metadata: {
          reason: 'Test reason',
          attemptCount: 3,
        },
      });

      const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);

      expect(loggedData.metadata).toEqual({
        reason: 'Test reason',
        attemptCount: 3,
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('auditEventAccess', () => {
    it('should log event search access', () => {
      const consoleErrorSpy = spyOn(console, 'error');

      auditEventAccess(
        'test-caller',
        'Test Caller',
        'search',
        5,
        'test-service',
        { query: 'test query' }
      );

      const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);

      expect(loggedData.action).toBe('event_access_search');
      expect(loggedData.callerId).toBe('test-caller');
      expect(loggedData.callerName).toBe('Test Caller');
      expect(loggedData.message).toContain('5 event(s)');
      expect(loggedData.serviceId).toBe('test-service');
      expect(loggedData.resourceType).toBe('event');
      expect(loggedData.metadata).toEqual({ query: 'test query' });

      consoleErrorSpy.mockRestore();
    });

    it('should log event details access', () => {
      const consoleErrorSpy = spyOn(console, 'error');

      auditEventAccess(
        'test-caller',
        undefined,
        'get_details',
        1,
        'test-service',
        { eventId: 'event-123' }
      );

      const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);

      expect(loggedData.action).toBe('event_access_get_details');
      expect(loggedData.success).toBe(true);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('auditAuthFailure', () => {
    it('should log missing token failure', () => {
      const consoleErrorSpy = spyOn(console, 'error');

      auditAuthFailure('anonymous', 'missing_token');

      const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);

      expect(loggedData.level).toBe('WARNING');
      expect(loggedData.action).toBe('authentication_failure');
      expect(loggedData.callerId).toBe('anonymous');
      expect(loggedData.success).toBe(false);
      expect(loggedData.message).toContain('missing_token');

      consoleErrorSpy.mockRestore();
    });

    it('should log invalid token failure', () => {
      const consoleErrorSpy = spyOn(console, 'error');

      auditAuthFailure('unknown', 'invalid_token', { tokenHash: 'abc123' });

      const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);

      expect(loggedData.message).toContain('invalid_token');
      expect(loggedData.metadata).toEqual({ tokenHash: 'abc123' });

      consoleErrorSpy.mockRestore();
    });

    it('should log expired token failure', () => {
      const consoleErrorSpy = spyOn(console, 'error');

      auditAuthFailure('token-id', 'expired_token', {
        expiresAt: '2024-01-01T00:00:00Z',
      });

      const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);

      expect(loggedData.message).toContain('expired_token');
      expect(loggedData.callerId).toBe('token-id');

      consoleErrorSpy.mockRestore();
    });
  });

  describe('auditAuthorizationDenied', () => {
    it('should log unauthorized service access attempt', () => {
      const consoleErrorSpy = spyOn(console, 'error');

      auditAuthorizationDenied(
        'test-caller',
        'Test Caller',
        'restricted-service',
        'get_timeline',
        { attemptedAction: 'read' }
      );

      const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);

      expect(loggedData.level).toBe('WARNING');
      expect(loggedData.action).toBe('authorization_denied');
      expect(loggedData.callerId).toBe('test-caller');
      expect(loggedData.serviceId).toBe('restricted-service');
      expect(loggedData.success).toBe(false);
      expect(loggedData.message).toContain('restricted-service');

      consoleErrorSpy.mockRestore();
    });
  });

  describe('auditAuthSuccess', () => {
    it('should log successful authentication', () => {
      const consoleErrorSpy = spyOn(console, 'error');

      auditAuthSuccess('test-caller', 'Test Caller', {
        authorizedServices: ['service-1', 'service-2'],
      });

      const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);

      expect(loggedData.level).toBe('INFO');
      expect(loggedData.action).toBe('authentication_success');
      expect(loggedData.callerId).toBe('test-caller');
      expect(loggedData.callerName).toBe('Test Caller');
      expect(loggedData.success).toBe(true);
      expect(loggedData.metadata.authorizedServices).toEqual(['service-1', 'service-2']);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('HIPAA Compliance', () => {
    it('should include all required audit fields', () => {
      const consoleErrorSpy = spyOn(console, 'error');

      auditEventAccess(
        'caller-id',
        'Caller Name',
        'search',
        10,
        'healthcare-service',
        { query: 'patient records' }
      );

      const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);

      // HIPAA audit requirements
      expect(loggedData.timestamp).toBeDefined(); // When
      expect(loggedData.callerId).toBeDefined(); // Who
      expect(loggedData.action).toBeDefined(); // What action
      expect(loggedData.resourceType).toBeDefined(); // What resource
      expect(loggedData.success).toBeDefined(); // Success/failure
      expect(loggedData.serviceId).toBeDefined(); // Where

      consoleErrorSpy.mockRestore();
    });

    it('should use ISO 8601 timestamps', () => {
      const consoleErrorSpy = spyOn(console, 'error');

      auditLog({
        level: 'INFO',
        action: 'test',
        callerId: 'test',
        success: true,
      });

      const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      const timestamp = loggedData.timestamp;

      // Verify ISO 8601 format
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(new Date(timestamp).toISOString()).toBe(timestamp);

      consoleErrorSpy.mockRestore();
    });
  });
});
