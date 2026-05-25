# Operational Readiness

This runbook moves `chat-service` from a production-capable realtime baseline toward an operationally mature internal
collaboration platform. It complements the deploy details in `docs/server-deploy.md` and the manual smoke flows in
`docs/manual-chat-testing.md`.

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
   git diff --check
   ```

3. Inspect the release diff:

   ```powershell
   git diff origin/develop...HEAD
   git diff --stat origin/develop...HEAD
   ```

4. Confirm the diff has no secrets, bearer tokens, access tokens, real `.env` values, debug logging, temporary comments,
   wildcard CORS, renderer auth fallback, or unrelated file changes.

5. Confirm the release does not introduce unplanned architecture:

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
- Realtime shows connected and does not fall back during ordinary room switching.
- Send/retry clears optimistic pending state.
- Notification routing opens the expected room.
- Close/reopen restores the last relevant chat state and reconnects realtime.

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
- `duplicate_event`
- `parse_error`
- `reconnect_requested`
- `polling_refresh`

Diagnostic payloads must stay limited to kind, status, timestamp, optional event name, and selected room id. Do not log
SSE URLs, query strings, bearer tokens, request headers, message bodies, notification bodies, user display names, or
secrets.

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
