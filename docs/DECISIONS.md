# Design decisions

The main choices in this project, why they were made, and what they cost.

## Data

### Two databases: PostgreSQL and MongoDB

**Decision:** accounts, sessions and the audit log are in PostgreSQL; the catalog, access requests, keys, notifications and usage logs are in MongoDB.

**Why:** accounts and audit entries have a fixed shape and benefit from enforced constraints and foreign keys. API listings embed their plans, and usage logs are high-volume and queried with aggregation, which suits documents.

**Trade-off:** no transactions or foreign keys across the two, so user ids stored in MongoDB are kept valid by the application, and joins happen in code. For an application of this size, one database would be enough; both were used to build real experience with each.

### Embed plans in the API document

**Why:** plans are small, always read with their API, and never queried alone. One read returns everything, and an API and its plans update atomically.

**When not to:** usage logs grow without limit, so they are a separate collection referencing the API.

### One active access request per developer and API, enforced by the database

**Decision:** a partial unique index on `{ apiId, developerId }` covering only documents with `active: true`.

**Why:** an application-level check cannot stop two simultaneous requests; the index can. Rejected and revoked requests are not covered, so a developer can ask again.

## Security

### Short JWT access tokens plus rotating refresh tokens

**Why:** access tokens are checked without a database lookup, which is fast but means they cannot be revoked; a 15-minute lifetime limits the damage of a leak. Refresh tokens are stored (as hashes) and can be revoked. Each works once; reusing one revokes the whole login, because it means the token was copied.

**Trade-off:** logout and role changes take up to 15 minutes to affect an existing access token. Two tabs refreshing at the same instant log the user out; a short grace period would fix that.

### Refresh token in an httpOnly, SameSite=Strict cookie; access token in memory

**Why:** page scripts cannot read the cookie, so cross-site scripting cannot steal the long-lived token, and other sites cannot make the browser send it. The access token is never written to localStorage.

**Consequence:** the dashboard proxies `/api/*` to the API, so the cookie stays first-party and no CORS is needed in the browser.

### Hash API keys and refresh tokens with SHA-256, passwords with bcrypt

**Why:** keys and tokens are 256 random bits, so there is nothing to guess and a fast, deterministic hash can be looked up by index. Passwords are guessable, so they need a slow, salted hash.

### An allowlist for upstream hosts

**Why:** the gateway makes requests on behalf of publishers. Without limits, a publisher could point it at internal addresses such as cloud metadata services (server-side request forgery). Hosts are checked when an API is saved and on every request, and redirects are not followed.

## Gateway and performance

### Cache key and API lookups, invalidate on change

**Why:** every gateway call needs both. Caching removed two database round trips per call; see [benchmarks.md](benchmarks.md).

**Trade-off:** data can be stale. Revoking a key or access and editing an API invalidate immediately (after the transaction commits); short lifetimes (30–60 seconds) bound any missed invalidation.

### Fixed-window rate limiting, failing open

**Why:** one counter per key per window is cheap; a Lua script makes the increment and expiry atomic in Redis.

**Trade-off:** a client can send a full window's allowance at the end of one window and again at the start of the next. If the counter store is down, requests are allowed rather than blocked, because an outage of the limiter should not become an outage of every API.

### Buffer usage logs and write them in batches

**Why:** one insert per request would add a database round trip to every call. Logs are written every 2 seconds or 200 entries with one `insertMany`, and on shutdown.

**Trade-off:** a crash loses the last few seconds of logs: acceptable for analytics, not for billing.

## Events

### Publish after commit, consume idempotently

**Decision:** events are published after the change they describe is saved. The worker acknowledges a message only after handling it, retries once, then sends it to a dead-letter queue. Handlers write with the event id under a unique index, so a repeated delivery is recorded once.

**Trade-off:** if the broker is unreachable at the moment of publishing, the event is lost (the change itself is kept). A **transactional outbox**, storing the event in the same transaction as the change and publishing from there, would remove that gap.

### Run without RabbitMQ or Redis

**Why:** the project must run on free hosting and on a laptop without containers. `EVENT_BUS=inline` runs the same handler inside the API; without `REDIS_URL`, rate limits and caches are kept in memory. Both work for a single server; several servers need the real services.

## Engineering

### Generate the OpenAPI document from the validation schemas

**Why:** documentation written separately drifts from the code. Here the Zod schemas that validate requests also produce the documented request rules, and a test compares the real Express routes with the documented ones in both directions.

### Integration tests against real databases

**Why:** constraints, transactions, indexes and aggregation behave differently in mocks. Tests use a separate Neon branch and Atlas database (or Postgres and an in-memory MongoDB replica set in CI), and refuse to run if pointed at the main database.
