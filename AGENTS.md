# AGENTS.md

## Project Rules

- Use `yarn` only. Do not use `npm` or `pnpm`.
- Keep TypeScript strict.
- Do not use `any`.
- Use `import type` for type-only imports.
- Do not put business logic in routes.
- Validate boundaries with Zod.
- Prisma schema changes must be explicit and reviewed as data model changes.
- Keep the service as a standalone Node.js/TypeScript microservice.
- Do not add Docker unless explicitly requested.
- Do not add NATS or WebSocket implementation before the planned phases.

## Verification

Before considering a change done, run:

- `yarn type-check`
- `yarn lint`
- `yarn test`
