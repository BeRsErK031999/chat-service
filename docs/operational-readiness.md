# Operational Readiness

This runbook moves `chat-service` from a production-capable realtime baseline toward an operationally mature internal
collaboration platform. It complements the deploy details in `docs/server-deploy.md` and the manual smoke flows in
`docs/manual-chat-testing.md`.

For the freeze-audit view of critical runtime/security/navigation invariants and how each one is protected, see
`docs/chat-runtime-readiness-matrix.md`.

For the limited desktop beta rollout contract, see `docs/chat-controlled-rollout.md`. The rollout gate controls the
desktop entry point only; it does not replace bearer auth, room permissions, SSE, ActivityPanel behavior, navigation
continuity, or diagnostics.

## Release Gate

Use this gate before promoting `develop` to `main` or before treating a staging deploy as rollout-ready.

1. Confirm the working tree and branch:

   ```powershell
   git fetch origin
   git status --short --branch
   git branch --show-current
   git rev-parse HEAD
   ```

2. Run local validation:

   ```powershell
   yarn prisma:generate
   yarn db:validate
   yarn type-check
   yarn lint
   yarn test
   yarn build
   yarn check:chat-env
   yarn chat:smoke-checklist
   yarn chat:realtime-stress-checklist
   yarn chat:rollout-checklist
   git diff --check
   ```

3. Read the helper output:

   - `yarn check:chat-env` checks env schema/documentation guardrails, `CHAT_INTERNAL_AUTH_SECRET` prefix safety,
     explicit CORS origin presence, dev-user-id mode, and Private Network Access documentation/code presence.
   - `yarn chat:smoke-checklist` prints the pre-deploy, post-deploy API/SSE, native desktop, security grep, and known
     limitation checklist.
   - `yarn chat:realtime-stress-checklist` prints the long-session room switching, overlay reopen, reconnect cycle, and
     safe diagnostic review flow.
   - `yarn chat:rollout-checklist` prints the controlled desktop rollout gate, beta smoke, and rollback checklist.
   - Neither helper prints secret values, makes network requests, deploys, opens Electron, or proves that staging is
     reachable.

4. Inspect the release diff:

   ```powershell
   git diff origin/develop...HEAD
   git diff --stat origin/develop...HEAD
   ```

5. Confirm the diff has no secrets, bearer tokens, access tokens, real `.env` values, debug logging, temporary comments,
   wildcard CORS, renderer auth fallback, or unrelated file changes.

6. Confirm the release does not introduce unplanned architecture:

   - no WebSocket migration;
   - no NATS, Redis, or queue dependency;
   - no RBAC redesign;
   - no Kubernetes or microservice split;
   - no Docker/deploy behavior change unless explicitly reviewed.

## Deploy Sanity

Before deploy:

- Confirm Docker Desktop is running on the workstation.
- Confirm `CHAT_SERVICE_DEPLOY_SSH_KEY` is set when using the staging key path.
- Confirm the server `.env` already exists and is not uploaded by deploy scripts.
- Confirm new Prisma migration directories are present only when the change intentionally modifies the data model.
- Confirm migration rollback risk has been reviewed before `yarn deploy:migrate:server`.

Deploy:

```powershell
yarn deploy:server
```

Apply migrations separately only when needed:

```powershell
yarn deploy:migrate:server
```

After deploy:

- Confirm `docker compose ps` showed healthy/running services in the deploy output.
- Confirm the backend health check passed through the deploy script.
- Confirm external health:

  ```powershell
  curl.exe -i "http://192.168.22.37/chat/api/health"
  ```

  The response body must be `{"status":"ok"}` from `chat-service`. If this returns a frontend HTML shell, the active
  nginx server block for the staging IP is catching `/chat/api/*` before the chat-service location include.
- Confirm `/chat/` opens and the playground can use bearer mode.
- Confirm nginx still preserves SSE headers for `/chat/api/events`.

## Post-Deploy Smoke

Use short-lived bearer tokens only. Do not paste, log, commit, or screenshot token values.

Minimum API and realtime smoke:

- `GET /chat/api/health` returns `200`.
- `GET /chat/api/rooms` with bearer auth returns `200`.
- `GET /chat/api/rooms` with only `x-user-id` returns `401` when `CHAT_ALLOW_DEV_USER_ID=false`.
- `/chat/api/events?accessToken=<short-lived-token>` returns `text/event-stream`.
- The SSE stream observes `message.created`, `notification.created`, `room.read`, and `presence.changed` during a
  normal two-user smoke.
- Replaying the same message request with the same `Idempotency-Key` returns the same message id.

Desktop renderer smoke:

- Native overlay opens from `time-tracker-desktop`.
- Rooms render with task grouping, context, unread cues, and notification cues.
- ActivityPanel renders both Needs attention and Recent activity from existing rooms and notifications.
- Realtime shows connected and does not fall back during ordinary room switching.
- Send/retry clears optimistic pending state.
- Notification routing opens the expected room through the shared navigation target model.
- Close/reopen restores the last relevant room/task/message navigation target and reconnects realtime.
- Remembered targets are initial-only restore hints. After restore, ordinary room clicks, Back, Recent task, and activity
  clicks must not be pinned by the restored target.
- Task/message navigation targets behave predictably: task-only targets preserve context, room targets select rooms, and
  message targets highlight only when the message is loaded.
- Activity references remain derived from existing notifications and rooms, route through navigation targets, and do not
  create EventSource churn.
- Malformed `sessionStorage` continuity values skip/failed-restore gracefully without a crash.
- `sessionStorage` contains no token-like values; only the canonical `chat-nav:v1?...` target string and timestamp are
  allowed for continuity.
- Interaction hints remain ephemeral, debounced, stale-expiring, and do not affect notifications, unread counts, or SSE
  lifecycle. `room.typing` and `room.activity` remain documented-only future event shapes; there is no backend fanout,
  persistence, or production typing UI in this foundation slice.

CORS and Private Network Access smoke from the desktop dev origin:

```powershell
curl.exe -i -X OPTIONS "http://192.168.22.37/chat/api/rooms" `
  -H "Origin: http://localhost:5175" `
  -H "Access-Control-Request-Method: GET" `
  -H "Access-Control-Request-Headers: authorization,content-type" `
  -H "Access-Control-Request-Private-Network: true"
```

Expected headers:

- `access-control-allow-origin: http://localhost:5175`
- `access-control-allow-private-network: true`

Security invariants to recheck during smoke:

- no wildcard CORS;
- no `webSecurity: false`;
- no renderer identity fallback;
- no auth fallback in production mode;
- no token, `accessToken`, secret, authorization header, message body, or notification body leakage in logs or
  diagnostics.

## Long-Session Confidence

Run this check before broader internal rollout and after changes touching realtime, polling, desktop lifecycle, or
diagnostics.

1. Keep one desktop panel or browser playground session open for at least 60 minutes.
2. During the session, repeatedly switch rooms, focus search, mark notifications read, close/open the overlay, and send
   messages.
3. Confirm room switching alone does not create visible realtime flicker.
4. Confirm a single visible widget owns a single active EventSource stream.
5. Confirm closing the overlay or browser tab cleans up its EventSource stream.
6. Confirm reconnect does not accumulate duplicate events, duplicate notifications, or duplicate pending messages.
7. Confirm polling fallback remains a fallback and does not mask a permanently disconnected SSE stream.

Allowed diagnostics are sanitized lifecycle events such as:

- `connect_start`
- `connected`
- `disconnected`
- `cleanup`
- `duplicate_connection_prevented`
- `duplicate_event`
- `parse_error`
- `reconnect_requested`
- `reconnect_succeeded`
- `reconnect_failed`
- `room_switched`
- `polling_refresh`

Diagnostic payloads must stay limited to kind, status, timestamp, optional event name, selected room id, lifecycle
counters, last connect/disconnect timestamps, reconnect reason, room count, and unread count. Do not log SSE URLs, query
strings, bearer tokens, request headers, message bodies, notification bodies, user display names, or secrets.

Healthy long-session signals:

- one visible widget reports `activeEventSourceCount=1` after connect;
- ordinary room switches emit `room_switched` without increasing EventSource count;
- overlay close emits `cleanup`, and reopen returns to `connect_start` then `connected`;
- temporary network loss increments reconnect attempt/failure counters, then recovery increments success and refreshes
  rooms, messages, and notifications;
- duplicate events may be reported, but they should not duplicate visible messages, notifications, unread counts, or
  pending sends.
- activity restore, message highlight restore, task restore, Back, and Recent task all work without EventSource churn;
- malformed continuity storage reports restore skipped/failed without crash and without sensitive diagnostic fields.
- Automated runtime regression guardrails now cover canonical target roundtrip, continuity storage failure modes,
  ActivityPanel keyboard actions/traversal, sanitized diagnostics, and EventSource lifecycle counters.
- Reusable test/dev assertions are available from the chat UI package: `assertSingleEventSource()`,
  `assertNoLeakMarkers()`, `assertNoTokenDiagnostics()`, and `assertRuntimeDiagnosticsSafe()`.

Unhealthy signals:

- `activeEventSourceCount` grows above `1` for one widget instance;
- reconnect diagnostics repeat continuously after network recovery;
- room switching alone creates reconnect churn;
- close/reopen loses the last relevant room, unread continuity, or notification routing;
- notification/task/message target routing diverges between desktop and browser hosts;
- restored targets pin `requestedRoomId`, so room clicks, Back, or Recent task bounce back to the restored room;
- parent-controlled navigation keeps overriding internal ChatWidget navigation after the initial restore;
- activity references require backend inbox/feed state or ranking to work;
- ActivityPanel is hidden by desktop CSS/layout, or attention items crowd out Recent activity so the activity baseline
  cannot be verified;
- typing/activity hints create persistent state, unread counts, notifications, or noisy realtime fanout;
- diagnostics include tokens, URLs with `accessToken`, Authorization headers, cookies, message bodies, notification
  bodies, secrets, or display names.

## Rollback Checklist

Application rollback and database rollback are separate decisions.

Fast application rollback:

1. Identify the last known-good commit hash.
2. Confirm whether the failed release applied Prisma migrations.
3. If no incompatible migration was applied, switch to the last known-good commit.
4. Run local validation:

   ```powershell
   yarn type-check
   yarn lint
   yarn test
   yarn build
   yarn check:chat-env
   yarn chat:realtime-stress-checklist
   git diff --check
   ```

5. Deploy the last known-good checkout:

   ```powershell
   yarn deploy:server
   ```

6. Run health, bearer rooms, SSE, PNA preflight, desktop overlay, send/retry, and notification routing smoke.

Database rollback:

- Do not assume container rollback reverses Prisma migrations.
- Review the exact migration SQL and data impact.
- Prefer forward-fix migrations for non-trivial data changes.
- Coordinate downtime only when the migration is not backward compatible.

## Evidence Record

For each rollout candidate, record:

- service repo commit hash;
- desktop repo commit hash when desktop smoke is part of the rollout;
- validation commands and pass/fail result;
- deploy target and deploy time;
- whether migrations were applied;
- health result;
- bearer API result;
- SSE result;
- PNA preflight result when desktop dev origin targets a private IP;
- desktop smoke result;
- known limitations or skipped checks.

Keep the evidence free of secrets, tokens, raw Authorization headers, signed URLs, query-string access tokens, and
message or notification content.

## Staging Routing And Diagnostics Evidence - 2026-05-25

Result: live diagnostics smoke passed after the external staging nginx routing fix and the desktop lifecycle
stabilization.

Routing:

- External nginx fix variant A was applied to `/etc/nginx/conf.d/truebim-structural-calcs.conf` by removing
  `192.168.22.37` from `server_name`, leaving `server_name truebim-calc.local;`.
- Backup was created at `/etc/nginx/conf.d/truebim-structural-calcs.conf.bak-20260525093427`.
- `sudo nginx -t` passed, nginx was reloaded, and nginx remained active.
- `GET http://192.168.22.37/chat/api/health -> 200` with body `{"status":"ok"}`.
- `GET http://192.168.22.37/chat/ -> 200` and returned the Chat Service playground HTML.
- PNA `OPTIONS /chat/api/rooms` from `Origin: http://localhost:5175 -> 204` with
  `access-control-allow-origin: http://localhost:5175`,
  `access-control-allow-private-network: true`, and
  `access-control-allow-headers: content-type,x-user-id,idempotency-key,authorization`.
- `Host: truebim-calc.local` still routes to structural-calcs. Bare-IP structural-calcs access now falls through the
  shared apps-platform default server, which is the accepted shared staging IP tradeoff.

Bearer API/SSE smoke:

- Short-lived bearer tokens were generated only in memory; token values and raw SSE URLs were not printed or recorded.
- Bearer `/rooms -> 200`, 3 rooms loaded, and `Direct Chat` was found.
- `x-user-id /rooms -> 401` and `/events?userId=... -> 401`.
- Bearer SSE connected with `text/event-stream`.
- SSE observed `message.created`, `notification.created`, `room.read`, and `presence.changed`.
- Idempotent retry with the same `Idempotency-Key` returned the same message id.
- Reconnect returned `text/event-stream`.

Native desktop diagnostics:

- The desktop dev runtime launched with `VITE_CHAT_DIAGNOSTICS=true` against
  `http://192.168.22.37/chat/api`.
- The native overlay opened, loaded rooms, showed `Realtime connected`, sent a message, cleared optimistic pending,
  routed a notification, marked read, displayed presence, and restored `Direct Chat` after close/reopen.
- Diagnostics remained sanitized. Temporary runtime logs were scanned for `accessToken`, bearer/Authorization markers,
  `CHAT_INTERNAL_AUTH_SECRET`, renderer-prefixed signing secrets, and raw SSE URL markers; no matches were found.
- Healthy counters after the desktop fix: `maxActive=1`, `leakMarkers=0`, expected cleanup on dev remount and overlay
  close/reopen, no reconnect failures, and room switching emitted `room_switched` without EventSource recreation.

No WebSocket, NATS, Redis, auth redesign, renderer identity fallback, wildcard CORS, TLS bypass, or Electron
`webSecurity` downgrade was introduced.

## Verified Activity Continuity Baseline - 2026-05-26

Result: production-capable local activity continuity baseline is verified for the desktop runtime.

- ActivityPanel rendered Needs attention and Recent activity in the native Electron overlay.
- Canonical targets used the `chat-nav:v1?...` envelope and were stored as target string plus timestamp only.
- Overlay close/reopen restored activity room, task room, and room+message targets.
- Message highlight restored after reopen when the message was available in the loaded window.
- Malformed `sessionStorage` skipped restore without crash and emitted sanitized restore failure diagnostics.
- The restore pinning failure was reproduced and fixed: remembered targets seed initial selection only and no longer
  behave as a persistent `requestedRoomId`.
- Back, Recent task, ordinary room clicks, and activity clicks worked after restore without becoming parent-controlled.
- Runtime invariants during normal restore/reopen: `activeEventSourceCount_max=1`, `leakMarkers_count=0`,
  `duplicate_event_count=0`, `duplicate_connection_prevented_count=0`, and `reconnect_failed_count=0`.
- Auth/security invariants remained intact: bearer `/rooms -> 200`, `x-user-id /rooms -> 401`,
  `/events?userId=... -> 401`, bearer SSE returned `text/event-stream`, renderer env had no chat secret or renderer
  identity, and storage/diagnostics had no token-like values.
