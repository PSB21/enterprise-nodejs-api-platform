# API Management System

A platform where publishers list APIs, developers request access and receive API keys, and a gateway enforces those keys and tracks usage.

> **Status: in active development.** The project is being rebuilt in stages from an earlier MySQL prototype. Only what is listed under "Working today" exists so far.

## Working today

- Express 5 API in strict TypeScript
- Environment validation at startup
- One JSON error format, including 404s and malformed requests
- Security headers (Helmet) and a CORS allowlist
- Jest and Supertest tests

## Planned

- Authentication and role-based access on PostgreSQL
- API catalog, access requests and API keys on MongoDB
- Gateway with rate limiting and usage analytics
- Next.js dashboard

## Setup

Requires Node.js 24 (see `.nvmrc`).

```bash
npm install
cp apps/api/.env.example apps/api/.env
npm run dev
```

The API runs at `http://localhost:5000`. Check it with `GET /api/v1/health`.

The project is an npm workspaces monorepo, and the API lives in `apps/api`.

| Command             | Purpose                        |
| ------------------- | ------------------------------ |
| `npm run dev`       | Start the API with auto-reload |
| `npm test`          | Run the tests                  |
| `npm run typecheck` | Check types                    |
| `npm run lint`      | Run ESLint                     |
| `npm run format`    | Format the code with Prettier  |
| `npm run build`     | Compile to `apps/api/dist`     |
| `npm start`         | Run the compiled API           |
