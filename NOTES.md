## Task 1
### Approach
I approached this assignment in four major phases.
- The Cursory Assessment
- Fixing the Low-Hanging Fruit
- Taking a Deeper Dive
- Taking an Even Deeper Dive
### The Cursory Assessment
After getting the app up and running, I started by simply playing around with it in the browser and seeing what it does. After I got a general feel for how it works, I did a visual review of the code. Here are a few observations:
- The coding standards and formatting look excellent.
- Test-driven development is being used, however at a glance it appeared we may be missing some coverage.
- I noticed a comment in a test mentioning it had a problem with the semantic search
### Fixing the Low-Hanging Fruit
Since a comment specifically pointed out a problem, I decided to start there. I ran that code through my Github Copilot in my code editor (I use VSCode) and it discovered three urgent fixes.

#### Fix 1
The semantic search function completely bypassed authorization checks, allowing any caller to access events from services they weren't authorized to view. The solution was to add authorization filtering to the `semanticSearch()` function similar to that found in the `keywordSearch()` function in the events.ts file:

```typescript
// CRITICAL: Authorization filter - must match keywordSearch implementation
const authorizedFilter = getAuthorizedServiceFilter(context);
if (authorizedFilter !== '*') {
  conditions.push(inArray(events.serviceId, authorizedFilter));
}
```
#### Fix 2
There was a function called keywordCondition that took a string from the user and interpolated it as-is into a SQL query. This leaves us open for a SQL injection attack. So, I added a helper function called `escapeLikePattern()` that used escape characters to ensure that if the user tried to pass SQL queries into a form field, it would not be passed as a SQL query. I applied the helper function to all LIKE functions.

#### Fix 3
In the `src/mcp/auth.ts` file there was a .catch callback in the db.update() function that was empty and a comment pointing it out. So I added a console.error to it so user will know when there's a problem updating the database.

#### Fix 4
My AI Copilot turned out to be well versed on HIPAA, and it discovered that there was no audit trail of who accessed the data or failed authentication attempts. This was the fix that required the most work. I added five functions:

- `auditLog()` - Core logging function
- `auditEventAccess()` - Logs event queries
- `auditAuthFailure()` - Logs failed auth
- `auditAuthSuccess()` - Logs successful auth
- `auditAuthorizationDenied()` - Logs access denials

These functions generate and store:
- JSON-formatted logs to stderr (for SIEM integration),
- ISO 8601 timestamps,
- Caller identification,
- Action tracking,
- Success/failure status, and
- Resource metadata

I integrated these functions into al the authentication in `src/mcp/auth.ts` and all event access functions in `src/services/events.ts`.
### Taking a Deeper Dive
Some tests that seemed fine on the earlier inspection turned out to be problematic in the deeper dive. Some of them, such as `db.select()` and `generateEmbedding()`, had been mocked up to return an empty array instead of actually connecting to a database. This caused the unit tests to pass, even though they were completely nonfunctional.

To solve this, I created a new file at `tests/security.tests.ts` and built functions that interact with the real database and test whether:
- semantic search was successfully enforced
- keyword search was successfully enforced
- admin wildcard access succeeds
- `getEventById` blocks unauthorized access
- `getServiceTimeline` blocks unauthorized service
- empty authorized services array returns no results
- prevents SQL injection by escaping percent signs, underscores, backslashes and single quotes
- rejects bad authentication, such as missing, invalid and expired tokens

Also, at this point none of my audit logging functionality had tests. So I added `tests/audit.tests.ts` and added these functions:
- `auditEventAccess()` logs searches/access
- `auditAuthFailure()` logs failed auth
- `auditAuthSuccess()` logs successful auth
- `auditAuthorizationDenied()` logs access denials

These functions test for:
- who, what, when, where, success/failure,
- proper timestamp format, and
- structured for SIEM parsing

**Note:** To run the tests in `security.test.ts`:
```bash
docker compose up -d
bun run db:reset
bun test
```
### Summary

| Problem | Before | After | 
|--------|--------|-------|
| Critical Vulnerabilities | 3 | 0 |
| HIPAA Compliance | No audit trail | Full audit logging |
| Test Files | 1 (but mocked data) | 3 (with real data) |
| Test Coverage | 30%-ish | 70%-ish |
| SQL Injection Risk | Very High | None |
| Authorization Bypass Risk | Very High | None |

---

### Recommended Future Improvements
1. Database Improvements: Add pool settings, timeouts, retry logic to avoid crashes under high demand (especially important in hospitals and universities where you might have a large number of users),
2. Input Validation: Add length limits and PII detection before OpenAI API calls,
3. Remove Environment Variable Fallback: - Remove `process.env.PEI_AUTH_TOKEN` fallback; If the individual team doesn't have their own token, the request should simply fail. It's way too easy for the token to accidentally get leaken to Github/Gitlab/Bitbucket/etc. like this.
4. Rate Limiting: Protect against brute force and DDoS attacks
7. Error logs: All errors currently just logging to the console, fine for dev, not for prod. Consider a Node logging library like Pino or Winston
---

## Task 2
### Approach
`get_impact_summary` is a new MCP tool that generates natural language summaries of significant events for a service. I handled this task in four major steps
1. First I defined the input scheme and types in the `index.ts` file
2. Then I created the service function in the `services` directory to fetch and summarize events
3. Then I registered the MCP tool in `server.ts`
4. Last, I added tests for the new tool

### Notes on Considerations
- The call location is src/services/summarization.ts (I decided to use the real API instead of a mock.)
- For services with many events, I limited the context window to only the most recent events and prioritized them by severity with the most critical first.
- I structured the error handling exactly like the existing tools. I also used the same authorization pattern.
---
### Notes on Design Decisions
I had to make a few design decisions that weren't specifically dictated in the assignment. Here are a few notes about those.
- Event descriptions are limited to 200 characters to save tokens
- Contract and error handling are exact immitations of the others in this app
- LLM to generate 2-3 paragraph summary, low temp (0.3) for professionalism
- I set up fallback behavior when there's no OpenAI API key with a summary template
- I built 13 tests in `tests/impact-summary.test.ts` covering:
    - authorized/unauthorized access
    - maxEvents limit respected
    - date filter failure
    - No empty events, empty auth, nonexistent service
    - Human-readable summaries

### Example Usage
Via MCP Inspector:
```json
{
  "serviceId": "acme-billing",
  "startDate": "2024-01-01T00:00:00Z",
  "endDate": "2024-01-31T23:59:59Z",
  "maxEvents": 20
}
```

Returns:
```json
{
  "service": "acme-billing",
  "timeRange": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-31T23:59:59Z"
  },
  "summary": "The acme-billing service experienced 2 critical incidents during January 2024, including a payment processing failure due to webhook misconfiguration. The service recovered after key rotation and configuration updates. Two deployments were completed successfully..."
}
```

### Potential Future Changes
- Rate Limiting: Consider rate limits on LLM calls (OpenAI has quotas)
- Caching: Could cache summaries for X minutes to reduce API costs
- Timeout Handling: OpenAI calls can take 2-5 seconds; consider timeout settings

---

## Notes on AI tools
Two years ago, I was an AI detractor. I found it clunky and doubted that it would ever be very useful. I've never been so happy to be so wrong. 

About a year ago, it probably sped my workflow up 20 percent. Today, it probably speeds my workflow up 200-300 percent. Thanks to AI tools now being integrated into my IDE, such as the one I use (Github Copilot) I rarely actually type any of the code myself. In fact, AI has advanced so quickly in just the past 4–6 months, I've found my role has changed from being a developer who has an AI assistant to do grunt work, to becoming almost a coach to an AI developer. The AI makes the changes, I review them, make modifications, and tell the AI why I made the changes for training purposes. 

Occassionally, my Copilot tool is completely off-base (though those occassions are growing more and more infrequent) so I use a variety of tools. My secondary tool is a chat application I built and host on the server in my home lab that runs on an uncensored Claude Sonnet model. I use it when I want a second opinion. 

In this assignment, I physically wrote very little code. My role has been to review the code, make adjustments, read error codes, reveiw changes, and direct the AI when it makes a suggestion that needs redirection or improvement. Lastly, I wrote these notes. For some reason, AI has a particularly style of writing that I just can't stomach.

## Challenges
- Some of the setup instructions were deprecated and I had to conduct research to update them. For example, in README.md on line 63 `bun run mcp:inspect` is now 404. After seeing the error in the terminal was trying to pull anthropics MCP inspector tool, I went to anthropic's website and found the updated terminal command and updated the package.json with it.
- The instructions were jargon-dense. For example: "This service provides a unified interface for querying and analyzing platform events across TimelyCare's microservices ecosystem." This type of writing made understanding the instructions challenging in many places. Something more human-friendly would have been helpful, such as, "TimelyCare runs a lot of microservices, such as payment processing, student login authentication, and patient portals. And when something goes wrong with one of them, it's often related to a problem in another. So, instead of investigating each of these services individually, this service allows you to use AI to investigate all of them at once in one place."
- Some examples on how a real human would use the interface would have been incredibly helpful. (Exe: "For example, if you'd like to search for a failed login, once you have the app up and running on localhost, you can click such and such button and enter 'failed' in such and such field and...")
- The comments in the code pointing out the problems was very helpful. It gave me a clue of where to start looking for problems. But since the app was running smoothly and the tests were all passing, it was a little bit challenging knowing where to start with Task 1. Sort of like painting on a blank canvas. A few more hints would have helped get my juices flowing. (Though in the end they did start flowing, so no harm.)