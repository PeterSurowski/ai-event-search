# Software Architect - Technical Challenge

## Introduction

Welcome to the TimelyCare architecture challenge. You'll be working with a real (simplified) service from our platform: the Platform Event Intelligence service.

This service provides a unified interface for querying platform events (deployments, incidents, config changes) across our multi-tenant telehealth platform. It exposes an MCP (Model Context Protocol) server that AI tools can use to search and analyze events.

**Time expectation:** ~4 hours, self-scheduled within 1 week of receiving this challenge.

---

## Getting Started

1. Clone the repository (link provided separately)
2. Review the `README.md` and `CLAUDE.md` for project context
3. Get the service running locally (`docker compose up -d`, `npm install`, `npm run db:reset`)

The repository includes Claude Code configuration. You're encouraged to use AI-assisted development tools—we're genuinely interested in how you work with them.

---

## Your Tasks

Complete **two** of the following three tasks.

### Task 1: Code Review & Quality Assessment

Conduct a thorough review of this codebase as if you were evaluating it for production readiness in a healthcare environment.

**Deliverables:**
- A written assessment covering: security considerations, architectural concerns, code quality issues, and test coverage gaps
- For any critical issues found, implement fixes
- Add or improve tests where you identify gaps

We're looking for the kind of review you'd give a PR from a senior engineer—constructive, specific, and prioritized.

### Task 2: Implement a New MCP Tool

Add a new tool called `get_impact_summary` that:
- Accepts a `serviceId` and optional time range
- Returns a natural language summary of significant events for that service
- Follows the authorization patterns established in the codebase

**Considerations:**
- Where should the LLM call live? (You can mock it or use a real API)
- How do you handle context window limits for services with many events?
- What's the tool's contract and error handling approach?

### Task 3: Design Event Correlation

Events often relate to each other in meaningful ways (deploy → incident → rollback). Design and implement a correlation mechanism.

**Considerations:**
- Should correlation happen at ingest time or query time?
- How do you model the relationships?
- How should correlated events be surfaced through the existing tools?

Implement enough to demonstrate your approach, then document what you'd build with more time.

---

## Submission

1. Create a PR against the repository with your changes
2. Include a write-up (1 page max) covering:
   - Which tasks you completed
   - Key decisions and tradeoffs
   - What you'd do differently with more time
   - How you approached the work (including AI tool usage)

---

## Evaluation Criteria

We're evaluating:

- **Architectural judgment** - Do your decisions reflect understanding of the constraints (multi-tenancy, healthcare, scale)?
- **Code quality** - Is your code clear, maintainable, and consistent with the existing patterns?
- **Security awareness** - Do you identify and address security considerations appropriately?
- **Communication** - Can you articulate technical decisions clearly?
- **Pragmatism** - Do you scope appropriately for the time available?

---

## Questions?

If anything is unclear, make reasonable assumptions and document them. We're evaluating your judgment as much as your code.

Good luck!
