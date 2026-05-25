# Manual Chat Testing

This is a temporary internal browser playground for testing `chat-service` over the existing HTTP API. It is not a
production messenger UI.

The `/chat/` UI is now a playground wrapper over the reusable frontend `ChatWidget` module in
`frontend/src/chat-ui`. Dev-only user selection lives in `frontend/src/playground` and is intentionally kept out of the
reusable widget.

## Dev Seed

Run the seed against the target database before manual testing:

```powershell
yarn dev:seed
```

On the Ubuntu Docker server, run the same seed inside the deployed app image:

```bash
cd /opt/apps/projects/chat-service
docker compose run --rm app yarn dev:seed:server
```

The seed is idempotent and creates these dev playground users:

| User | `x-user-id` |
| --- | --- |
| Artem | `11111111-1111-4111-8111-111111111111` |
| Tester | `22222222-2222-4222-8222-222222222222` |

It also creates these rooms:

- `Direct Chat`
- `Team Room`
- `task-123/internal`

The seed inserts starter messages, read states, unread notifications for Tester, and a `TaskRoomLink` for
`task-123` with `roomScope=internal`.

## Deploy

Deploy from the Windows workstation:

```powershell
yarn deploy:server
```

Use key-based SSH for deploy. See `docs/server-deploy.md` for `CHAT_SERVICE_DEPLOY_SSH_KEY` setup and the emergency
password fallback.

Preflight before browser testing:

- `scripts/deploy-server.ps1` exists and `yarn deploy:server` completes.
- `yarn deploy:migrate:server` is run separately only when new Prisma migrations need to be applied.
- `yarn dev:seed` or server-side `docker compose run --rm app yarn dev:seed:server` has been run when dev test data
  needs refresh.
- `http://192.168.22.37/chat/` opens the playground.
- The selected user sees `Realtime connected`.
- `Open task-123/internal` opens the seeded task room.

The deploy builds and uploads two images:

- `chat-service:latest`
- `chat-service-playground:latest`

The server compose project runs:

- backend on `127.0.0.1:4100`
- frontend playground on `127.0.0.1:4101`
- PostgreSQL on Docker network, with optional host-local access on `127.0.0.1:55432`

Apply Prisma migrations separately when needed:

```powershell
yarn deploy:migrate:server
```

## Nginx

Use `deploy/nginx.chat-service.conf` as the server route template. It exposes:

- `http://192.168.22.37/chat/` for the playground
- `http://192.168.22.37/chat/api/` as a proxy to the backend API
- `/` remains proxied to the backend service

After copying the nginx config to the server, validate and reload nginx using the server's established workflow.

## Open UI

Open this URL inside the office network:

```text
http://192.168.22.37/chat/
```

Send the same URL to another person on the office network.

The first screen is the playground auth switcher. Use `Bearer token` mode for staging and any environment where
`CHAT_ALLOW_DEV_USER_ID=false`. The selected Artem/Tester label is only display identity in this mode; the pasted token
is the real authenticated identity used by the API and SSE.

Use `Dev user` mode only for local/dev backends with `CHAT_ALLOW_DEV_USER_ID=true`. When dev auth is disabled, the
playground surfaces the `401` auth error instead of silently falling back to `x-user-id`.

## Short-Lived Bearer Token

Generate a short-lived test token from a trusted shell that has the same `CHAT_INTERNAL_AUTH_SECRET` as the target
backend. The command prints sensitive token output only because the developer explicitly ran it; do not commit, log, or
share the token.

```powershell
$env:CHAT_INTERNAL_AUTH_SECRET="<same secret as target backend>"
yarn chat:token --userId=11111111-1111-4111-8111-111111111111 --displayName=Artem --source=playground --ttl=900
yarn chat:token --userId=22222222-2222-4222-8222-222222222222 --displayName=Tester --source=playground --ttl=900
```

Paste the matching token into `/chat/` using `Bearer token` mode. Prefer fresh tokens with short TTLs. Do not paste real
production secrets into the browser; only paste already-signed short-lived test tokens.

## Two-Person Test

1. Generate short-lived Artem and Tester bearer tokens.
2. Open `http://192.168.22.37/chat/` in one browser, choose `Bearer token`, select `Artem`, paste the Artem token, and
   open the playground.
3. Ask another person to open the same URL, choose `Bearer token`, select `Tester`, paste the Tester token, and open the
   playground.
4. Select `Direct Chat`, `Team Room`, or `task-123/internal`.
5. Send messages from each browser.
6. Wait a few seconds or click `Refresh`.
7. Confirm unread counters and last message previews update.
8. Click `Mark as read` in a room and confirm unread counters clear.
9. Check the notifications panel and mark notifications read.

## Task Room Lookup Test

The backend can resolve a task room by business context:

```bash
curl "http://192.168.22.37/chat/api/task-rooms/lookup?taskId=task-123&roomScope=internal" \
  -H "x-user-id: 11111111-1111-4111-8111-111111111111"
```

Expected response:

```json
{
  "roomId": "<task-room-id>",
  "taskId": "task-123",
  "roomScope": "internal",
  "roomName": "task-123/internal"
}
```

To verify the browser flow:

1. Open `http://192.168.22.37/chat/`.
2. Select `Artem`.
3. Click `Open task-123/internal`.
4. Confirm the widget opens the `task-123/internal` room.
5. Repeat as `Tester`; Tester should see the room only while Tester is an active member.

Missing links, missing rooms, non-members, and left members return `404` so the API does not reveal other users' task
rooms.

## Runtime Notifications Test

1. Open `http://192.168.22.37/chat/` in one browser and select `Artem`.
2. Open the same URL in another browser or on another PC and select `Tester`.
3. Select `Direct Chat` in both browsers.
4. Send a message from `Artem`.
5. Wait up to 5 seconds for notification polling, or click `Refresh`.
6. Confirm `Tester` sees a new unread notification with the message preview.
7. Confirm `Artem` does not receive a notification for Artem's own message.
8. In the `Tester` browser, click `Mark read` on the notification.
9. Confirm the notification remains visible but is no longer counted as unread.

## Workflow UX Smoke

Use this checklist after task-centric UX or desktop snapshot changes. Record only what was actually observed.

1. Open `/chat/` in bearer mode and confirm rooms load with `Realtime connected`.
2. Confirm task rooms are grouped separately and unread/activity cues render on room rows.
3. Confirm search filters by room text, task id, project id, type, scope, and latest message preview.
4. Press `Ctrl`/`Cmd+K` or `/` and confirm search receives focus.
5. With search focused, use `ArrowUp`/`ArrowDown` to switch visible rooms and `Enter` to open the first match.
6. Confirm opening a room focuses the composer.
7. Use the header actions to jump to next unread, return to the previous discussion, reopen a recent task room, open a
   related discussion, mark read, and mark unread.
8. Use keyboard traversal: `Alt+ArrowUp`/`Alt+ArrowDown` for previous/next room,
   `Alt+Shift+ArrowUp`/`Alt+Shift+ArrowDown` for previous/next unread room, `Ctrl`/`Cmd+Shift+A` for active discussion
   cycling, and `Ctrl`/`Cmd+Shift+L` for previous discussion.
9. In a task room, confirm task reference chips render and `Copy ref` writes the task reference when browser clipboard is
   available.
10. Route a notification through `navigationTarget` and confirm the target room opens. Message highlight is best-effort
    when the target message is in the loaded message window.
11. Send a message and confirm the peer client receives `message.created` and `notification.created`.
12. Retry the same send path with the same `Idempotency-Key` through the API and confirm one persisted message id.
13. Mark a room read and confirm `room.read` updates unread state.
14. Confirm presence indicators render when `presence.changed` events are observed.

If browser automation or a second visual client is unavailable, write that limitation down instead of replacing it with a
local code assertion.

## Realtime SSE Test

The reusable chat UI opens an `EventSource` connection built from the configured `apiBaseUrl`.

In bearer mode, the playground passes `auth={{ strategy: "bearer", token }}` into `ChatWidget`, HTTP requests use
`Authorization: Bearer <token>`, and SSE uses:

```text
/chat/api/events?accessToken=<short-lived-chat-token>
```

Browser `EventSource` cannot set custom headers, so the access token query parameter is the current production-style SSE
transport. Keep token TTL short and avoid logging query strings. WebSocket is not implemented.

In dev-user mode, SSE uses `/chat/api/events?userId=<current-user-id>`. That mode is for local/dev only and requires
`CHAT_ALLOW_DEV_USER_ID=true`.

The Electron desktop dev renderer is loaded from `http://localhost:5175` during `yarn dev`. That exact origin must be in
`CHAT_CORS_ALLOWED_ORIGINS` or `CORS_ALLOWED_ORIGINS`, along with `http://127.0.0.1:5175` when the desktop renderer is
loaded through the loopback address.

1. Generate short-lived Artem and Tester bearer tokens.
2. Open `http://192.168.22.37/chat/` in one browser with `Bearer token` mode as Artem.
3. Open the same URL in another browser or on another PC with `Bearer token` mode as Tester.
4. Confirm both screens show `Realtime connected`.
5. Select `Direct Chat` in both browsers.
6. Send a message from `Artem`.
7. Confirm `Tester` sees the message and notification without waiting for the polling fallback.
8. Click `Mark read` on the Tester notification and confirm the notifications panel updates.

If the SSE connection drops, the UI shows `Realtime disconnected, using polling fallback`. Polling still runs, but now
only as a slower fallback.

Verify SSE headers for the desktop renderer origin:

```bash
curl -i -N "http://192.168.22.37/chat/api/events?accessToken=<short-lived-chat-token>" \
  -H "Origin: http://localhost:5175"
```

Expected headers:

- `HTTP/1.1 200 OK`
- `content-type: text/event-stream; charset=utf-8`
- `access-control-allow-origin: http://localhost:5175`
- `cache-control: no-cache, no-transform`
- `x-accel-buffering: no`

If Electron shows `Realtime disconnected, using polling fallback`, `EventSource.readyState` quickly becomes `2`, or a
renderer probe fails with `TypeError: Failed to fetch` while PowerShell/curl receives `text/event-stream`, check that
the SSE route writes CORS headers before the stream starts and that nginx forwards `Origin` for `/chat/api/events`.

## Idempotency Retry Test

The playground sends a new `Idempotency-Key` header for every message submit. There is no offline retry queue in the
playground, but the backend can safely replay the same client request when the same key, user, room, and body are used.

Use the browser UI to find the `Direct Chat` room id, or call `GET /rooms` as Artem:

```bash
curl -H "x-user-id: 11111111-1111-4111-8111-111111111111" \
  http://192.168.22.37/chat/api/rooms
```

Send the same message twice with the same key:

```bash
ROOM_ID="<direct-room-id>"
KEY="manual-retry-$(date +%s)"

curl -X POST "http://192.168.22.37/chat/api/rooms/$ROOM_ID/messages" \
  -H "content-type: application/json" \
  -H "x-user-id: 11111111-1111-4111-8111-111111111111" \
  -H "Idempotency-Key: $KEY" \
  --data '{"body":"Manual idempotency retry test"}'

curl -X POST "http://192.168.22.37/chat/api/rooms/$ROOM_ID/messages" \
  -H "content-type: application/json" \
  -H "x-user-id: 11111111-1111-4111-8111-111111111111" \
  -H "Idempotency-Key: $KEY" \
  --data '{"body":"Manual idempotency retry test"}'
```

Both responses should contain the same message `id`. The room should show only one new message, and Tester should get
only one notification. Reusing the same key with a different body in the same room as the same user should return `409`.

## Permissions Smoke Test

Room and notification endpoints hide records that do not belong to the current `x-user-id`. A missing room and a room
where the user is not an active member both return `404`.

Confirm each user sees only their active rooms:

```bash
curl -H "x-user-id: 11111111-1111-4111-8111-111111111111" \
  http://192.168.22.37/chat/api/rooms

curl -H "x-user-id: 22222222-2222-4222-8222-222222222222" \
  http://192.168.22.37/chat/api/rooms
```

Use a room id that does not belong to Tester, or a random UUID, and confirm Tester gets `404` for messages and read
state updates:

```bash
ROOM_ID="00000000-0000-4000-8000-000000000000"

curl -i -H "x-user-id: 22222222-2222-4222-8222-222222222222" \
  "http://192.168.22.37/chat/api/rooms/$ROOM_ID/messages"

curl -i -X POST "http://192.168.22.37/chat/api/rooms/$ROOM_ID/read" \
  -H "content-type: application/json" \
  -H "x-user-id: 22222222-2222-4222-8222-222222222222" \
  --data '{"lastReadSequence":1}'
```

For notifications, take an Artem notification id and try to mark it read as Tester. The expected response is `404`:

```bash
NOTIFICATION_ID="<artem-notification-id>"

curl -i -X POST "http://192.168.22.37/chat/api/notifications/$NOTIFICATION_ID/read" \
  -H "x-user-id: 22222222-2222-4222-8222-222222222222"
```

## Current MVP Limits

- No WebSocket or Socket.IO.
- No production login system; bearer tokens are supplied by the host or generated manually for internal testing.
- No file upload, reactions, typing indicators, edit, or delete.
- Polling fallback refreshes messages, rooms, and notifications when SSE is disconnected or disabled.
- New user messages create unread backend notifications for other active room members.
- The layout is intended for desktop internal testing, not mobile use.

## Staging Bearer Playground Smoke - 2026-05-21

Staging was deployed with `CHAT_ALLOW_DEV_USER_ID=false` and the browser playground was checked in bearer mode. Token
values were not recorded.

- `x-user-id` HTTP auth returned `401`.
- `/events?userId=<uuid>` returned `401`.
- Artem and Tester both opened `/chat/` in `Bearer token` mode with short-lived `source=playground` tokens.
- Both browsers loaded rooms and showed `Realtime connected`.
- Artem sent a Direct Chat message; Tester received it without waiting for polling.
- Tester had a backend notification for the Artem message and the playground notification action was available.
- Tester replied; Artem received the reply without waiting for polling.
- `Dev user` mode showed the helpful auth error while dev auth was disabled.

Desktop + browser playground smoke was attempted after this browser smoke, but Electron main could not fetch the trusted
desktop identity from the time-tracker dev backend because the HTTPS request failed during TLS negotiation. The desktop
renderer also failed to reach the same backend. The renderer was not given `CHAT_INTERNAL_AUTH_SECRET`, and the desktop
bearer path was not faked.
