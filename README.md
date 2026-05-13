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

## Not Included Yet

- WebSocket gateway.
- NATS consumers or publishers.
- Full chat HTTP API.
- Auth implementation beyond `AUTH_MODE` configuration.
- Real database migrations.
- Docker packaging.
- Attachments, images, reactions, calls, complex search, or end-to-end encryption.

## Commands

```bash
yarn install
yarn prisma:generate
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
