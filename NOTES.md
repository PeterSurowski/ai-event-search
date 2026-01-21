## Task 1
### Approach
I approached this assignment in four major phases.
- The Cursory Assessment
- Fixing the Low-Hanging Fruit
- Taking a Deeper Dive
- Taking an Even Deeper Dive
### The Cursory Assessment
After getting the app up and running, I started by simply playing around with it in the browser and seeing what it does. After I got a general feel for how it works, I did a visual review of the code. Here were a few observations:
- The coding standards look excellent.
- Test-driven development is being used, however at a glance it appears we may be missing some coverage.
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
There was a function called keywordCondition that took a string from the user and interpolated it as-is into a SQL query. This leaves us open for a SQL injection attack. So, I added a helper function called `escapeLikePattern()` that used escape characters to ensure that if the user tried to pass SQL queries into a form field, it would not be passed as a SQL query. I applied the helper function to all LIKE functions.\

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
- semantic search successfully enforced
- keyword search successfully enforced
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
### Task 1 Summary

### Before & After

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
I handled this in four major stops
1. Firs t I defined the input scheme and types in the `index.ts` file
2. Then I created the service function in the `services` directory to fetch and summarize events
3. Then I registered the MCP tool in `server.ts`
4. Last, I added tests for the new tool

### Notes on Considerations
- The call location is src/services/summarization.ts (I decided to use the real API instead of a mock.)
- For services with many events, I limited the context window to only the most recent events and prioritized them by severity with the most critical first.
- I structured the error handling exactly like the existing tools. I also used the same authorization pattern.














## Challenges
- Some of the setup instructions were deprecated and I had to conduct research to update them. For example, in README.md on line 63 `bun run mcp:inspect` is now 404. After seeing the error in the terminal was trying to pull anthropics MCP inspector tool, I went to anthropic's website and found the updated terminal command and updated the package.json with it.
- The instructions were jargon-dense. For example: "This service provides a unified interface for querying and analyzing platform events across TimelyCare's microservices ecosystem." This type of writing made understanding the instructions challenging in many places. Something more human-friendly would have been helpful, such as, "TimelyCare runs a lot of microservices, such as payment processing, student login authentication, and patient portals. And when something goes wrong with one of them, it's often related to a problem in another. So, instead of investigating each of these services individually, this service allows you to use AI to investigate all of them at once in one place."
- Some examples on how a real human would use the interface would have been incredibly helpful. (Exe: "For example, if you'd like to search for a failed login, once you have the app up and running on localhost, you can click such and such button and enter 'failed' in such and such field and...")
- 