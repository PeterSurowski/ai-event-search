import { db } from '../db/index.js';
import { apiTokens } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { McpCallerContext } from '../types/index.js';
import { createHash } from 'crypto';
import { auditAuthFailure, auditAuthSuccess } from '../services/audit.js';

/**
 * Resolve the caller context from MCP request metadata
 * 
 * The MCP client should pass authentication information in the request metadata.
 * This function validates the token and returns the caller's authorization context.
 */
export async function resolveCallerContext(extra: unknown): Promise<McpCallerContext> {
  // Extract metadata from MCP extra parameter
  const metadata = extractMetadata(extra);
  
  // Check for API token authentication
  const authToken = metadata?.authToken || process.env.PEI_AUTH_TOKEN;
  
  if (!authToken) {
    // No authentication - return a context with no access
    // In production, you might want to throw an error instead
    auditAuthFailure('anonymous', 'missing_token');
    return {
      callerId: 'anonymous',
      authorizedServices: [],
      callerType: 'token',
    };
  }
  
  // Look up the token
  const tokenHash = hashToken(authToken);
  const token = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, tokenHash))
    .limit(1);
  
  if (token.length === 0) {
    auditAuthFailure('unknown', 'invalid_token', { tokenHash });
    return {
      callerId: 'invalid',
      authorizedServices: [],
      callerType: 'token',
    };
  }
  
  const tokenRecord = token[0]!;
  
  // Check expiration
  if (tokenRecord.expiresAt && tokenRecord.expiresAt < new Date()) {
    auditAuthFailure(tokenRecord.id, 'expired_token', {
      name: tokenRecord.name,
      expiresAt: tokenRecord.expiresAt.toISOString(),
    });
    return {
      callerId: tokenRecord.id,
      authorizedServices: [],
      callerType: 'token',
    };
  }
  
  // Update last used timestamp (fire and forget)
  db.update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, tokenRecord.id))
    .catch((err) => {
      // Log but don't fail auth if timestamp update fails
      console.error('Failed to update lastUsedAt for token:', tokenRecord.id, err);
    });
  
  // Audit successful authentication
  auditAuthSuccess(tokenRecord.id, tokenRecord.name, {
    authorizedServices: tokenRecord.authorizedServices,
  });
  
  return {
    callerId: tokenRecord.id,
    callerName: tokenRecord.name,
    authorizedServices: tokenRecord.authorizedServices,
    callerType: 'token',
  };
}

/**
 * Extract metadata from MCP extra parameter
 */
function extractMetadata(extra: unknown): Record<string, string> | null {
  if (!extra || typeof extra !== 'object') {
    return null;
  }
  
  // MCP SDK passes metadata in the extra parameter
  const extraObj = extra as Record<string, unknown>;
  
  if ('metadata' in extraObj && typeof extraObj.metadata === 'object') {
    return extraObj.metadata as Record<string, string>;
  }
  
  return null;
}

/**
 * Hash a token for secure storage/comparison
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Create a new API token (utility for setup/testing)
 */
export async function createApiToken(
  name: string,
  authorizedServices: string[],
  createdBy: string,
  expiresInDays?: number
): Promise<{ token: string; id: string }> {
  const token = generateSecureToken();
  const tokenHash = hashToken(token);
  
  const result = await db
    .insert(apiTokens)
    .values({
      tokenHash,
      name,
      authorizedServices,
      createdBy,
      expiresAt: expiresInDays 
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        : undefined,
    })
    .returning({ id: apiTokens.id });
  
  return { token, id: result[0]!.id };
}

/**
 * Generate a secure random token
 */
function generateSecureToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
