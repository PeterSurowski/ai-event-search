Analyze the authorization model in this codebase.

Focus on:
1. How caller context is resolved and propagated
2. Where authorization checks are (or should be) applied
3. Any gaps or inconsistencies in the authorization enforcement

Start by reviewing:
- src/types/index.ts (McpCallerContext definition)
- src/mcp/auth.ts (context resolution)
- src/services/events.ts (query logic)

Provide a summary of findings with specific code references.
