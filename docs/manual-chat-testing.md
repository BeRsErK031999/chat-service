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

Use key-based SSH for deploy. See `docs/server-deploy.md` for `CHAT_SERVICE_DEPLOY_SSH_KEY` setup and the temporary
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

The first screen is the playground user switcher. It selects a dev user and then renders `ChatWidget` with
`apiBaseUrl="/chat/api"` and the selected `currentUser`.

## Two-Person Test

1. Open `http://192.168.22.37/chat/` in one browser and select `Artem`.
2. Ask another person to open the same URL and select `Tester`.
3. Select `Direct Chat`, `Team Room`, or `task-123/internal`.
4. Send messages from each browser.
5. Wait a few seconds or click `Refresh`.
6. Confirm unread counters and last message previews update.
7. Click `Mark as read` in a room and confirm unread counters clear.
8. Check the notifications panel and mark notifications read.

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

## Realtime SSE Test

The reusable chat UI opens an `EventSource` connection built from the configured `apiBaseUrl`, currently
`/chat/api/events?userId=<current-user-id>` in the playground. The query parameter is for temporary dev auth only;
production auth should replace it with cookie, JWT, or session-based auth.

1. Open `http://192.168.22.37/chat/` in one browser and select `Artem`.
2. Open the same URL in another browser or on another PC and select `Tester`.
3. Confirm both screens show `Realtime connected`.
4. Select `Direct Chat` in both browsers.
5. Send a message from `Artem`.
6. Confirm `Tester` sees the message and notification without waiting for the polling fallback.
7. Click `Mark read` on the Tester notification and confirm the notifications panel updates.

If the SSE connection drops, the UI shows `Realtime disconnected, using polling fallback`. Polling still runs, but now
only as a slower fallback.

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
- No JWT or production auth.
- No file upload, reactions, typing indicators, edit, or delete.
- Polling fallback refreshes messages, rooms, and notifications when SSE is disconnected or disabled.
- New user messages create unread backend notifications for other active room members.
- The layout is intended for desktop internal testing, not mobile use.
