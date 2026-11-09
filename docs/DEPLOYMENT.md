# Deployment

Three ways to run the project, from simplest to most complete. Everything here uses free plans. If a provider asks for a payment card, skip that step: the app works without it.

## 1. Locally, with hosted databases

The development setup. Nothing runs on your machine except Node.js.

1. Create free databases: a [Neon](https://neon.tech) Postgres project and a [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) M0 cluster. In Atlas, allow your IP under **Network Access**.
2. Copy `apps/api/.env.example` to `apps/api/.env` and fill in `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `MONGODB_URI` and `JWT_SECRET`.
3. Run:

   ```bash
   npm install
   npm run db:deploy --workspace=@ams/api   # create the Postgres tables
   npm run db:seed --workspace=@ams/api     # demo users, APIs and traffic
   npm run dev                              # API on http://localhost:5000
   npm run dev:web                          # dashboard on http://localhost:3000
   ```

Redis and RabbitMQ are optional. Without `REDIS_URL`, rate limits and caches live in memory; with `EVENT_BUS=inline` (the default), events are handled inside the API.

## 2. Everything in Docker

Runs Postgres, MongoDB, Redis, RabbitMQ, the API, the event worker and the dashboard. Needs Docker and about 2–3 GB of free memory.

```bash
docker compose up --build
docker compose run --rm migrate npm run db:seed   # demo data, once the stack is up
```

Open http://localhost:3000. The RabbitMQ management UI is at http://localhost:15672 (user and password `ams`). CI runs this same stack on every push.

## 3. Free public demo: Render and Vercel

| Part            | Service                       | Free plan limits to know                                                                   |
| --------------- | ----------------------------- | ------------------------------------------------------------------------------------------ |
| API             | Render web service            | Sleeps after 15 minutes without traffic; the next request takes about a minute to wake it. |
| Dashboard       | Vercel Hobby                  | For personal, non-commercial projects.                                                     |
| Postgres        | Neon free                     | Pauses when idle and wakes on the next query.                                              |
| MongoDB         | Atlas M0                      | 0.5 GB. Pauses after a long period with no connections.                                    |
| Redis, RabbitMQ | Upstash, CloudAMQP (optional) | Check current free limits when signing up.                                                 |

Limits change, so check each provider's pricing page before relying on them.

### Allow Render to reach Atlas

Free Render services do not have a fixed outbound IP address, so an Atlas rule for your home IP is not enough. Either:

- add [Render's published outbound IP ranges](https://render.com/docs/outbound-ip-addresses) for your region under Atlas **Network Access**, or
- allow `0.0.0.0/0`. The database still requires its username and password, but anyone can attempt to connect, so use a long random password.

### Deploy the API to Render

1. Push the repository to GitHub.
2. In Render, choose **New → Blueprint** and select the repository. It reads [render.yaml](../render.yaml).
3. Enter the secrets it asks for:
   - `DATABASE_URL`: the Neon **pooled** URL.
   - `MONGODB_URI`: the Atlas URL.
   - `CORS_ORIGINS`: your Vercel URL, for example `https://ams-dashboard.vercel.app`.
   - `REDIS_URL`: optional.
4. Deploy, then open `https://<your-service>.onrender.com/api/docs` to check it.

Render's free plan cannot run migrations as part of a deploy, so run them from your machine against the same database, before the first deploy and after adding a migration:

```bash
npm run db:deploy --workspace=@ams/api
```

### Deploy the dashboard to Vercel

1. In Vercel, import the repository and set **Root Directory** to `apps/web`.
2. Add the environment variable `API_URL` = `https://<your-service>.onrender.com`.
3. Deploy. Next.js forwards `/api/*` to the API, so the browser only talks to the Vercel domain and the login cookie stays first-party.

`API_URL` is read at build time, so redeploy the dashboard if the API's address changes.

### Keep the demo awake before an interview

Open the dashboard a couple of minutes before you need it, so the API and the databases have time to wake up. Have a short screen recording ready as a backup.

## Production notes

These are the parts a real deployment would change:

- **Migrations** would run in the pipeline (or a release step), not from a laptop.
- **Events** would use RabbitMQ with the worker as its own service, and a transactional outbox so no event can be lost between saving a change and publishing it.
- **Rate limits and caches** would use Redis, so every API instance shares them.
- **Secrets** would come from the platform's secret store, and `JWT_SECRET` would be rotated.
- **Observability**: structured logs, request IDs and metrics instead of `console` output.
