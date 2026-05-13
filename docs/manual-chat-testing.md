# Manual Chat Testing

This is a temporary internal browser playground for testing `chat-service` over the existing HTTP API. It is not a
production messenger UI.

## Dev Seed

Run the seed against the target database before manual testing:

```powershell
yarn dev:seed
```

The seed is idempotent and creates:

| User | `x-user-id` |
| --- | --- |
| Artem | `11111111-1111-4111-8111-111111111111` |
| Tester | `22222222-2222-4222-8222-222222222222` |

It also creates these rooms:

- `Direct Chat`
- `Team Room`
- `task-123/internal`

The seed inserts starter messages, read states, and unread notifications for Tester.

## Deploy

Deploy from the Windows workstation:

```powershell
yarn deploy:server
```

The deploy builds and uploads two images:

- `chat-service:latest`
- `chat-service-playground:latest`

The server compose project runs:

- backend on `127.0.0.1:4100`
- frontend playground on `127.0.0.1:4101`

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

## Two-Person Test

1. Open `http://192.168.22.37/chat/` in one browser and select `Artem`.
2. Ask another person to open the same URL and select `Tester`.
3. Select `Direct Chat`, `Team Room`, or `task-123/internal`.
4. Send messages from each browser.
5. Wait a few seconds or click `Refresh`.
6. Confirm unread counters and last message previews update.
7. Click `Mark as read` in a room and confirm unread counters clear.
8. Check the notifications panel and mark notifications read.

## Current MVP Limits

- No WebSocket or Socket.IO.
- No JWT or production auth.
- No file upload, reactions, typing indicators, edit, or delete.
- Polling refreshes messages and rooms every 4 seconds.
- Polling refreshes notifications every 5 seconds.
- New messages currently use the existing `POST /rooms/:roomId/messages` contract and do not create new
  notifications automatically unless backend notification behavior is added later.
- The layout is intended for desktop internal testing, not mobile use.
