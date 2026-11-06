# Enterprise Node.js API Platform

Scalable backend API platform built using Node.js, Express.js, MySQL, Sequelize ORM, and JWT authentication.

## Features

- JWT Authentication
- RBAC Authorization
- REST APIs
- Sequelize ORM
- MySQL Integration
- Swagger Documentation
- Environment Variables
- Centralized Error Handling

## Tech Stack

- Node.js
- Express.js
- MySQL
- Sequelize
- JWT
- Swagger

## Setup

Requires Node.js 24 (see `.nvmrc`).

```bash
npm install
cp apps/api/.env.example apps/api/.env
npm run dev
```

The project is an npm workspaces monorepo. The API lives in `apps/api`.

| Command          | Purpose                        |
| ---------------- | ------------------------------ |
| `npm run dev`    | Start the API with auto-reload |
| `npm run lint`   | Run ESLint                     |
| `npm run format` | Format the code with Prettier  |

## API Documentation

http://localhost:5000/api-docs
