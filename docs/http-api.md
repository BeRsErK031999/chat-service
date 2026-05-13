# HTTP API

Phase 1B exposes a minimal JSON HTTP API for local desktop/web UI work.

## Auth

Protected endpoints require a temporary development header:

```http
x-user-id: <user uuid>
```

Missing or invalid `x-user-id` returns `401`. This is not JWT, OAuth, SSO, or production auth.

Public endpoints:

- `GET /health`
- `GET /ready`

## Rooms

### `GET /rooms`

Returns rooms where the current user has an active membership.

Each item includes:

- room fields
- `lastMessage`
- `unreadCount`
- `membership`

### `GET /rooms/:roomId/messages`

Requires room membership.

Query:

- `limit`: optional, default `50`, max `100`
- `beforeSequence`: optional positive integer

Returns messages ordered by descending `sequence`.

### `POST /rooms/:roomId/messages`

Requires room membership and a room that accepts user messages.

Body:

```json
{
  "body": "text message",
  "threadId": "optional uuid"
}
```

Creates a `TEXT` message. `threadId` is accepted at the HTTP boundary for UI compatibility but is not persisted yet because the current Prisma schema has no thread field.

### `POST /rooms/:roomId/read`

Requires room membership.

Body:

```json
{
  "lastReadSequence": 42
}
```

Upserts the current user's read state for the room.

## Notifications

### `GET /notifications`

Returns notifications for the current user.

Query:

- `state`: `unread`, `read`, or `all`; default `unread`
- `limit`: optional, default `50`, max `100`

### `POST /notifications/:id/read`

Marks a notification read only when it belongs to the current user. Attempts to update another user's notification return `403`.
