# Code Challenge: Platform Event Intelligence

A unified interface for querying and analyzing platform events across TimelyCare's microservices ecosystem. Exposes an MCP (Model Context Protocol) server for AI-assisted event analysis.

## Overview

This service ingests events from various sources (deployments, incidents, config changes, alerts) and provides both keyword and semantic search capabilities via MCP tools.

### Key Features

- **Multi-tenant architecture** - Events scoped to services with token-based authorization
- **Dual search modes** - Keyword (SQL) and semantic (pgvector) search
- **MCP interface** - Tools for AI agents and assistants to query platform events

## Quick Start

```bash
# Start PostgreSQL with pgvector
docker compose up -d

# Install dependencies
bun install

# Run migrations and seed data
bun run db:reset

# Start MCP server
bun run mcp:dev
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `search_events` | Search events by keyword or semantic similarity |
| `get_event_details` | Get full details for a specific event |
| `get_service_timeline` | Get chronological event timeline for a service |

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=pei
DB_PASSWORD=pei_dev_password
DB_NAME=platform_events

# OpenAI (optional - mock embeddings used if not set)
OPENAI_API_KEY=

# Auth token for MCP tools
PEI_AUTH_TOKEN=
```

## Development

```bash
bun run dev          # Start API server (watch mode)
bun run mcp:dev      # Start MCP server (watch mode)
bun run mcp:inspect  # MCP Inspector for testing tools
bun test             # Run tests
bun run typecheck    # Type checking
```

## Architecture

See `CLAUDE.md` for detailed architecture documentation and code conventions.

## License

Proprietary - TimelyCare Internal Use Only
