# chat-service

Standalone task-centric chat backend for TTS/Gantt communication.

This service is the future mini-chat core and is intended to replace Rocket.Chat as the final chat backend. The
current Rocket.Chat notification service remains a temporary prototype and is not connected to this project.

## Repository Direction

`chat-service` is the new main backend project for the custom mini-chat. Future development of own rooms,
messages, read states, notifications, and task-centric communication belongs in this repository.

`rocket-chat-notification-service` is no longer treated as the final chat core. It remains a temporary
Rocket.Chat prototype for validating NATS-to-notification delivery ideas while the final backend is built here.

Do not move future mini-chat implementation work back into the Rocket.Chat prototype. Architectural lessons can
be reused, but the final delivery target is this service's own persistence model and notification domain.

## Phase 1A Scope

- Fastify application foundation.
- Strict TypeScript setup.
- Zod-based environment validation.
- pino logger.
- Prisma schema for users, rooms, room members, messages, read states, notifications, and task-room links.
- Basic domain services for creating users, rooms, memberships, messages, read states, and notifications.
- Health and readiness endpoints.
- Vitest coverage for environment validation, health endpoints, and room domain helpers.

## Phase 1B Scope

- Basic protected HTTP API for rooms, room messages, read states, and notifications.
- Temporary local/dev auth via `x-user-id: <uuid>` header.
- Zod validation for route params, query strings, and request bodies.
- Membership checks before reading rooms, posting messages, or updating read states.
- Notification ownership checks before marking notifications read.
- Route tests use Prisma mocks and do not require a local PostgreSQL instance.

## Not Included Yet

- WebSocket gateway.
- NATS consumers or publishers.
- Full SSO/JWT auth.
- Real database migrations.
- Docker packaging.
- Attachments, images, reactions, calls, complex search, or end-to-end encryption.

See [docs/http-api.md](docs/http-api.md) for the current HTTP endpoints.

## Commands

```bash
yarn install
yarn prisma:generate
yarn db:validate
yarn type-check
yarn lint
yarn test
yarn build
```

Development server:

```bash
yarn dev
```

Required environment variables are listed in `.env.example`.

## Local PostgreSQL

Local PostgreSQL for Prisma migrations and integration smoke tests is defined in
`docker-compose.postgres.yml`.

See [docs/local-postgres.md](docs/local-postgres.md) for startup, migration, integration test, and volume reset commands.
