/**
 * Audit Logging Service
 * 
 * Provides structured audit logging for security-sensitive operations.
 * Required for HIPAA compliance (§164.312(b) - Audit Controls).
 * 
 * Logs are written to stderr in JSON format for integration with
 * centralized logging systems (e.g., CloudWatch, Splunk, ELK).
 */

export interface AuditLogEntry {
  timestamp: string;
  level: 'INFO' | 'WARNING' | 'ERROR';
  action: string;
  callerId: string;
  callerName?: string;
  success: boolean;
  resourceType?: string;
  resourceId?: string;
  serviceId?: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log an audit event
 */
export function auditLog(entry: Omit<AuditLogEntry, 'timestamp'>): void {
  const logEntry: AuditLogEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  
  // Write to stderr as JSON for structured logging
  // Production systems should configure log shipping to SIEM
  console.error(JSON.stringify({
    type: 'AUDIT',
    ...logEntry,
  }));
}

/**
 * Log successful event access
 */
export function auditEventAccess(
  callerId: string,
  callerName: string | undefined,
  action: 'search' | 'get_details' | 'get_timeline' | 'get_impact_summary',
  resultCount: number,
  serviceId?: string,
  metadata?: Record<string, unknown>
): void {
  auditLog({
    level: 'INFO',
    action: `event_access_${action}`,
    callerId,
    callerName,
    success: true,
    resourceType: 'event',
    serviceId,
    message: `Accessed ${resultCount} event(s)`,
    metadata,
  });
}

/**
 * Log authentication failure
 */
export function auditAuthFailure(
  callerId: string,
  reason: 'missing_token' | 'invalid_token' | 'expired_token',
  metadata?: Record<string, unknown>
): void {
  auditLog({
    level: 'WARNING',
    action: 'authentication_failure',
    callerId,
    success: false,
    message: `Authentication failed: ${reason}`,
    metadata,
  });
}

/**
 * Log authorization denial
 */
export function auditAuthorizationDenied(
  callerId: string,
  callerName: string | undefined,
  serviceId: string,
  _action: string,
  metadata?: Record<string, unknown>
): void {
  auditLog({
    level: 'WARNING',
    action: 'authorization_denied',
    callerId,
    callerName,
    success: false,
    resourceType: 'service',
    serviceId,
    message: `Access denied to service: ${serviceId}`,
    metadata,
  });
}

/**
 * Log successful authentication
 */
export function auditAuthSuccess(
  callerId: string,
  callerName: string | undefined,
  metadata?: Record<string, unknown>
): void {
  auditLog({
    level: 'INFO',
    action: 'authentication_success',
    callerId,
    callerName,
    success: true,
    message: 'Authentication successful',
    metadata,
  });
}
