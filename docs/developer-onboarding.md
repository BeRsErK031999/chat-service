# Developer Onboarding

This guide is the first path for developers joining the chat work across `chat-service` and
`time-tracker-desktop`. It explains the current architecture, local setup, validation workflow, and guardrails that
must stay intact while the product grows.

## Architecture Overview

`chat-service` is the standalone Node.js/TypeScript microservice that owns first-party chat persistence and delivery:
users, rooms, room membership, messages, read states, notifications, task-room links, presence state, HTTP API routes,
and SSE realtime events.

`time-tracker-desktop` is the Electron host application. It owns desktop runtime concerns: window chrome, the messenger
launcher, overlay lifecycle, desktop session lookup, Electron IPC/preload wiring, and any desktop-only adaptation around
the reusable chat UI.

Rocket.Chat is not the core chat runtime. It remains historical prototype context only. Do not add new Rocket.Chat,
WebSocket, NATS, Redis, Kubernetes, or microservice-split work as part of ordinary chat changes.

### Shared Chat UI

The reusable `ChatWidget` source of truth lives in `chat-service/frontend/src/chat-ui`. It is platform-neutral and owns:

- room, message, notification, unread, draft, optimistic send, retry, selected room, and presence presentation state;
- HTTP client calls to the chat API;
- the SSE lifecycle through `useChatRealtime`;
- task-centric chat context and workflow actions that can be consumed by multiple hosts.

The desktop repo consumes a snapshot/subtree at `time-tracker-desktop/src/features/chat/chat-ui`. Desktop must not make
product or host-specific changes inside that subtree. Shared UI changes start in `chat-service`, then flow into desktop
through the documented snapshot/subtree path. Desktop-owned adapters remain outside the shared tree, especially
`DesktopChatWidget`, `ChatLauncherButton`, desktop CSS wrappers, `config.ts`, Electron IPC, and main-process token
signing.

### Auth Boundary

Production-style auth is bearer-only. The trusted identity boundary is Electron main, not the renderer.

The desktop flow is:

```text
desktop session -> Electron main identity lookup -> Electron main short-lived chat credential -> chat-service bearer auth
```

The renderer must not know or create identity, signing input, or secrets. It asks Electron main for a chat auth result
through preload IPC and receives only the signed bearer credential plus the trusted identity returned by main. This keeps
renderer JavaScript from spoofing a user or leaking the signing secret through Vite bundles, devtools, or browser logs.

Local/dev can still use `dev-user-id` only when the backend explicitly allows it. Staging and production must run with:

```text
CHAT_ALLOW_DEV_USER_ID=false
```

### Realtime And State Recovery

SSE is the current realtime transport. WebSocket is not implemented in this slice of the product.

`chat-service` publishes user-scoped SSE events for messages, notifications, read state, reconnect refresh requests, and
presence changes. `ChatWidget` connects to the SSE stream, reports connecting/connected/disconnected status, refreshes
HTTP state after reconnect, and keeps polling as a fallback when the stream is unavailable.

Send retry uses idempotency. Failed local messages keep the same `Idempotency-Key`, so retry can recover without
duplicating persisted messages. Do not remove or regenerate the idempotency key during retry work.

Presence is lightweight and SSE-only. It uses connection transitions plus `User.lastSeenAt`; it is not a durable global
fanout layer and does not require Redis/NATS.

Notification routing is service-owned. Message sends create notification records for relevant users, emit notification
events over SSE, and drive unread badges in the reusable widget and desktop launcher.

Task-centric workflow UX is part of the reusable widget. The desktop adapter forwards selected task context and workflow
callbacks, while the widget renders task room cues, action affordances, room context, and workflow-aware messages without
knowing Electron details.

## Local Setup

Use `yarn` only in both repositories.

### Dependencies

```powershell
cd C:\Users\Borodin_Artem\Desktop\Projects\chat-service
yarn install
yarn prisma:generate

cd C:\Users\Borodin_Artem\Desktop\Projects\time-tracker-desktop
yarn install
```

### Environment Files

In `chat-service`, start from:

- `.env.example` for the general backend shape;
- `.env.local.example` for local development on `PORT=4100` and PostgreSQL on host port `55432`;
- `docs/local-postgres.md` for database commands.

Important backend variables:

- `DATABASE_URL`;
- `PORT`;
- `LOG_LEVEL`;
- `AUTH_MODE`;
- `CHAT_INTERNAL_AUTH_SECRET`;
- `CHAT_ALLOW_DEV_USER_ID`.

`CHAT_INTERNAL_AUTH_SECRET` and `CHAT_ALLOW_DEV_USER_ID` are server-side. Do not expose them through Vite.

In `time-tracker-desktop`, start from `.env.example` and place local overrides in `.env.local`.

Renderer-visible variables are only the `VITE_` values. Keep this list narrow:

- `VITE_CHAT_API_BASE_URL`;
- local-only `VITE_CHAT_DEV_USER_ID` and `VITE_CHAT_DEV_USER_DISPLAY_NAME` when using dev auth.

Main-process-only desktop variables:

- `CHAT_IDENTITY_API_BASE_URL`;
- `CHAT_INTERNAL_AUTH_SECRET`;
- `CHAT_AUTH_TOKEN_TTL_SECONDS`;
- `CHAT_USER_ID`;
- `CHAT_USER_DISPLAY_NAME`.

Never add or use `VITE_CHAT_INTERNAL_AUTH_SECRET`. Vite embeds `VITE_` variables into renderer JavaScript.

### Prisma And Database

For local PostgreSQL:

```powershell
cd C:\Users\Borodin_Artem\Desktop\Projects\chat-service
docker compose -f docker-compose.postgres.yml up -d
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:55432/chat_service?schema=public"; yarn db:migrate
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:55432/chat_service?schema=public"; yarn db:seed
```

Use `yarn db:validate` when checking schema validity without applying migrations. Prisma data model changes must be
explicitly reviewed as data model changes.

### Run Backend

```powershell
cd C:\Users\Borodin_Artem\Desktop\Projects\chat-service
$env:PORT="4100"
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:55432/chat_service?schema=public"
$env:CHAT_ALLOW_DEV_USER_ID="true"
yarn dev
```

The backend serves HTTP API routes and the SSE endpoint. Health and readiness endpoints are documented in
`docs/http-api.md` and `docs/server-deploy.md`.

### Run Frontend Playground

The playground is a host wrapper around the reusable `ChatWidget`. It is for browser/manual smoke only; dev-only user
selection must stay outside `frontend/src/chat-ui`.

```powershell
cd C:\Users\Borodin_Artem\Desktop\Projects\chat-service
yarn vite --host 127.0.0.1 --port 5173
```

Vite serves the playground from the `frontend` root and proxies `/chat/api` to `http://127.0.0.1:4100`. Set
`VITE_API_BASE_URL` only when the default `/chat/api` proxy path is not appropriate for your local shell. Use
`yarn build:web` when you need the production playground bundle.

### Run Desktop Runtime

```powershell
cd C:\Users\Borodin_Artem\Desktop\Projects\time-tracker-desktop
yarn dev
```

Desktop dev mode loads the renderer from `http://localhost:5175`. The target `chat-service` CORS and SSE allowlist must
include that exact origin when testing against staging or another remote backend.

For production-style staging smoke, provide the shared signing secret only to Electron main with
`CHAT_INTERNAL_AUTH_SECRET`; do not add a renderer-visible signing secret. The desktop app should request the trusted
identity in main, sign there, and pass bearer auth to `ChatWidget`.

## Validation Workflow

Before finishing a chat-service change:

```powershell
cd C:\Users\Borodin_Artem\Desktop\Projects\chat-service
yarn type-check
yarn lint
yarn test
yarn build
yarn check:chat-env
yarn chat:smoke-checklist
yarn chat:realtime-stress-checklist
git diff --check
git status --short --branch
```

`yarn check:chat-env` is a local guardrail helper. It reports whether the required server env keys are validated or
documented, whether `CHAT_INTERNAL_AUTH_SECRET` is accidentally exposed with a `VITE_` prefix, whether dev-user-id mode
is enabled in the current shell, whether explicit CORS origins are configured, and whether PNA support is documented.
It prints only safe statuses and never prints secret values. It does not contact staging or prove that real secrets are
correct.

`yarn chat:smoke-checklist` prints the manual pre-deploy, API/SSE, desktop visual smoke, security grep, and limitation
checklist. It does not execute requests, open Electron, deploy, or require credentials.

`yarn chat:realtime-stress-checklist` prints the long-session reconnect and overlay stress sequence. Use it when
checking EventSource accumulation, room-switch behavior, overlay reopen recovery, reconnect counters, and safe
diagnostic review. It is also read-only and does not require secrets.

When desktop docs or runtime files changed:

```powershell
cd C:\Users\Borodin_Artem\Desktop\Projects\time-tracker-desktop
yarn type-check
yarn build
git diff --check
git status --short --branch
```

For shared UI changes, also check snapshot parity between:

- `chat-service/frontend/src/chat-ui`;
- `time-tracker-desktop/src/features/chat/chat-ui`.

Use the subtree/snapshot workflow in `time-tracker-desktop/docs/chat-ui-source-strategy.md`. The expected result before
release is no unexplained diff between the shared source and the desktop snapshot.

From `chat-service`, a direct parity check is:

```powershell
git diff --no-index -- frontend/src/chat-ui ../time-tracker-desktop/src/features/chat/chat-ui
```

## Troubleshooting

### Backend Or API Does Not Respond

- Confirm `yarn dev` is running in `chat-service`.
- Check the configured `PORT` and request the matching `/health` route.
- Confirm `DATABASE_URL` points to the running PostgreSQL instance.
- Check logs for env validation failures before looking at route code.

### Prisma Or Database Issues

- Run `yarn prisma:generate` after dependency install or schema changes.
- Run `yarn db:validate` before applying migrations.
- Confirm local PostgreSQL is listening on `localhost:55432` when using the provided compose file.
- Re-run `yarn db:seed` when manual users or rooms are missing.

### Bearer Auth Fails

- Confirm `CHAT_INTERNAL_AUTH_SECRET` is set on `chat-service` and has at least 32 characters.
- Confirm Electron main uses the same secret for staging smoke.
- Confirm the auth credential is fresh and was signed by Electron main, not renderer code.
- Confirm `CHAT_ALLOW_DEV_USER_ID=false` in staging/prod so dev headers cannot mask bearer failures.

### Desktop Trusted Identity Fails

- Check that the desktop session token exists in the desktop app.
- Check `CHAT_IDENTITY_API_BASE_URL` and the `/desktop/api/v1/companies/employees/me/` response.
- Treat 401/403 from the identity endpoint as a desktop session problem.
- Do not fall back to renderer-provided identity for production-style smoke.

### Renderer Shows `Failed to fetch`

- Check the renderer origin. During `yarn dev`, it is usually `http://localhost:5175`.
- Confirm `chat-service` CORS allows that exact origin.
- Confirm the backend URL in `VITE_CHAT_API_BASE_URL` is reachable from the renderer, not only from PowerShell.
- Check browser/Electron devtools without copying credentials into issue comments or logs.

### PNA Or CORS Problems

- Verify the API response echoes the exact desktop renderer origin.
- Verify Private Network Access preflight behavior when a public or localhost origin reaches a private network address.
- Do not fix CORS by using wildcard origins for credentialed or production-style chat.
- Do not disable Electron web security.

### SSE Does Not Connect

- Confirm the SSE route uses the same allowed origin behavior as HTTP routes.
- Confirm proxy buffering is disabled for the SSE path.
- Confirm bearer-mode SSE uses the short-lived bearer credential path expected by `ChatWidget`.
- If HTTP calls work but realtime stays disconnected, inspect SSE response headers before changing desktop code.

### Reconnect Does Not Recover

- Confirm `RealtimeStatus` moves through disconnected and reconnecting/connected states.
- Confirm reconnect refresh callbacks reload rooms, selected room messages, notifications, read state, and presence.
- Check that duplicate events are deduplicated by persisted IDs and idempotency behavior.
- Do not hide a permanently broken stream behind polling-only success.

### Presence Does Not Update

- Confirm the user has an active SSE connection.
- Confirm another subscribed user receives `presence.changed`.
- Closing one of multiple connections for the same user must not produce a false offline state.
- Remember presence is lightweight; do not add Redis/NATS presence for this milestone.

### Notification Routing Does Not Work

- Confirm the sender and recipient are members of the room.
- Confirm message creation also creates notification records for the expected users.
- Confirm `notification.created` reaches the recipient's SSE stream.
- Confirm desktop launcher unread count is wired through `ChatWidget.callbacks.onUnreadCountChange`.

### Desktop Overlay Does Not Open

- Confirm the desktop app is past login and the titlebar messenger launcher is mounted.
- Check `DesktopChatWidget` rather than shared `ChatWidget` for overlay/window behavior.
- Confirm missing identity shows a fail-closed auth state instead of silently opening as an untrusted user.
- Reopen the overlay and verify last room state and SSE lifecycle recover.

### Font Or Asset Warnings

- Do not add unresolved local `@font-face` URLs for fonts that are not vendored.
- Keep desktop font fallback to installed `Poppins`, then system fonts.
- Treat missing runtime asset warnings as packaging or CSS path problems before touching chat auth/realtime code.

## Security Guardrails

- No renderer identity for production-style auth.
- No secret leakage into renderer code, docs evidence, logs, screenshots, or query-string captures.
- No `VITE_CHAT_INTERNAL_AUTH_SECRET`.
- No `webSecurity: false`.
- No wildcard CORS for chat API/SSE.
- No TLS verification bypass.
- `dev-user-id` is local/dev only.
- `CHAT_ALLOW_DEV_USER_ID=false` for staging and production.
- Keep bearer credential TTL short.
- Do not log Authorization headers, SSE URLs, request headers, cookies, message bodies, notification bodies, or user
  display names during diagnostics.
- Keep business logic out of routes and validate boundaries with Zod.

## Links

- [README](../README.md)
- [Operational readiness](operational-readiness.md)
- [Manual chat testing](manual-chat-testing.md)
- [Chat UI embedding](chat-ui-embedding.md)
- [HTTP API](http-api.md)
- [Local PostgreSQL](local-postgres.md)
- [Desktop chat integration](../../time-tracker-desktop/docs/chat-integration.md)
- [Desktop chat staging test](../../time-tracker-desktop/docs/chat-staging-test.md)
- [Desktop chat UI source strategy](../../time-tracker-desktop/docs/chat-ui-source-strategy.md)
