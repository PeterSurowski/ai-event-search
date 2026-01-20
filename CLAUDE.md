# Code Challenge: Platform Event Intelligence

## Overview

This service provides a unified interface for querying and analyzing platform events across TimelyCare's microservices ecosystem. It ingests events from various sources (deployments, incidents, config changes, alerts) and exposes them via an MCP (Model Context Protocol) server for AI-assisted analysis.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      MCP Clients                             │
│         (Claude, AI agents, internal tools)                  │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    MCP Server                                │
│  ┌─────────────┐  ┌─────────────┐  ┌───────────────────┐   │
│  │search_events│  │get_event_   │  │get_service_       │   │
│  │             │  │details      │  │timeline           │   │
│  └─────────────┘  └─────────────┘  └───────────────────┘   │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   Event Service                              │
│  ┌─────────────────┐  ┌────────────────────────────────┐   │
│  │ Keyword Search  │  │ Semantic Search (pgvector)     │   │
│  │ (SQL ILIKE)     │  │ (vector similarity)            │   │
│  └─────────────────┘  └────────────────────────────────┘   │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              PostgreSQL + pgvector                           │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────────┐    │
│  │ events   │  │ services │  │ api_tokens             │    │
│  │ (+ vec)  │  │          │  │ (authorization)        │    │
│  └──────────┘  └──────────┘  └────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Multi-Tenancy & Authorization

**Critical context:** This is a multi-tenant system. Events belong to services, and API tokens are scoped to specific services. The authorization model ensures that:

1. Each API token has an `authorized_services` array
2. Queries must only return events for services the caller is authorized to access
3. If a token has `['*']`, it has admin access to all services

The authorization context flows through the MCP layer via `McpCallerContext`:

```typescript
interface McpCallerContext {
  callerId: string;
  authorizedServices: string[];  // ['service-a', 'service-b'] or ['*']
  callerType: 'token' | 'user';
}
```

## Key Files

- `src/mcp/server.ts` - MCP server and tool definitions
- `src/mcp/auth.ts` - Token resolution and authorization context
- `src/services/events.ts` - Core event query logic (keyword + semantic search)
- `src/services/embeddings.ts` - Vector embedding generation
- `src/types/index.ts` - Shared types and Zod schemas
- `src/db/schema.ts` - Drizzle ORM schema definitions

## Development

### Setup

```bash
# Start PostgreSQL with pgvector
docker compose up -d

# Install dependencies
bun install

# Run migrations and seed data
bun run db:reset

# Start MCP server in development mode
bun run mcp:dev
```

### Testing with MCP Inspector

```bash
bun run mcp:inspect
```

### Test Tokens (from seed data)

```bash
# Admin (full access)
export PEI_AUTH_TOKEN=pei_admin_token_for_testing_only

# University Health System (university-* + core-gateway)
export PEI_AUTH_TOKEN=pei_university_health_token

# Acme Corp (acme-* + core-gateway)
export PEI_AUTH_TOKEN=pei_acme_corp_token
```

## Code Conventions

- **TypeScript strict mode** - All code must pass strict type checking
- **Zod for validation** - All external inputs validated with Zod schemas
- **Drizzle ORM** - Database queries use Drizzle, not raw SQL (except where necessary for pgvector)
- **Error handling** - Functions should return null/empty for "not found" rather than throwing
- **Authorization** - Always check authorization before returning data, never leak existence of unauthorized resources

## Search Modes

The `search_events` tool supports two search modes:

1. **Keyword search** (`useSemanticSearch: false`) - SQL ILIKE matching on title and description
2. **Semantic search** (`useSemanticSearch: true`) - Vector similarity using pgvector

Semantic search uses OpenAI's `text-embedding-3-small` model (1536 dimensions). In development without an API key, mock embeddings are generated for testing.

## Common Tasks

### Adding a new MCP tool

1. Define input schema in `src/types/index.ts`
2. Implement query logic in `src/services/events.ts`
3. Register tool in `src/mcp/server.ts`
4. Add tests in `tests/`

### Running tests

```bash
bun test           # Run once
bun test --watch   # Watch mode
```