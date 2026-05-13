# Chat Service Design

## Status

Draft for a future standalone `chat-service`. This document does not describe changes to the current
`rocket-chat-notification-service` implementation and does not require writing service code in this repository.

## Goal

The `chat-service` is a standalone Node.js/TypeScript microservice for task-centric communication in TTS/Gantt.
Its first business purpose is reliable delivery of task notifications to users, including desktop popup
notifications and realtime room updates.

Rocket.Chat is treated as a temporary notification delivery prototype, not as the final chat core. The target
service owns chat rooms, messages, read state, unread counters, notification records, and realtime delivery.

## Migration from Rocket.Chat prototype

The existing `rocket-chat-notification-service` is not the codebase for the final mini-chat backend. It remains a
temporary Rocket.Chat delivery prototype, while `chat-service` becomes the primary repository for the custom chat
core.

Rocket.Chat integration code should not be copied directly into `chat-service`. The migration should reuse
validated architectural ideas from the prototype:

- event contracts;
- routing rules;
- notification templates;
- delivery reliability patterns;
- idempotency handling;
- observability and operational checks.

The final delivery path changes from sending messages into Rocket.Chat channels to writing into first-party
`rooms`, `messages`, `read_states`, and `notifications` owned by `chat-service`.

The service must support two operating modes:

- Integrated TTS mode: users, roles, projects, tasks, and task membership are provided by external TTS/auth
  services.
- Standalone mode: the service can run with its own local user and membership data for development, testing,
  demos, and possible isolated deployments.

## MVP Scope

MVP should cover:

- Task rooms created or resolved from TTS/Gantt task events.
- System messages generated from task lifecycle events.
- User text messages inside task rooms.
- Room list with last message, membership, unread counters, and task context.
- Message history stored permanently.
- Per-user read state.
- Desktop popup notification records and realtime notification events.
- WebSocket realtime delivery for messages, room changes, read state changes, and notifications.
- HTTP API for room/message/notification access.
- NATS consumers for task event ingestion.
- NATS publishers for chat and notification events.
- PostgreSQL persistence through Prisma.
- Zod validation at API and event boundaries.
- pino structured logging.
- Vitest coverage for domain rules, permission checks, event mapping, and API handlers.

MVP load target:

- 100 total users.
- Up to 80 simultaneously active users.
- Small enough to run as one service instance initially, while keeping state and event contracts ready for
  horizontal scaling later.

## Out of MVP

The following are explicitly outside MVP:

- File attachments.
- Image uploads and previews.
- Message reactions.
- Audio/video calls.
- Complex full-text search.
- End-to-end encryption.
- Rich message formatting beyond plain text and structured system event metadata.
- Message editing and deletion, unless required later for moderation or compliance.
- Federation with external chat systems.
- Mobile push notifications.
- Retention policies and archival jobs.
- Docker packaging in the first design/implementation phase.

## Architecture

### Components

- HTTP API: Fastify application exposing authenticated REST endpoints for rooms, messages, read state, and
  notifications.
- WebSocket gateway: authenticated realtime channel for user-scoped events.
- NATS consumers: event ingestion from TTS/Gantt subjects such as task status, assignee, deadline, and comments.
- NATS publishers: outgoing chat domain events for other services and observability pipelines.
- PostgreSQL persistence: durable storage for users, rooms, memberships, messages, read states, notifications,
  and task-room links.
- Auth integration: JWT or token introspection against external TTS/auth-service in integrated mode.
- Standalone auth: local users and local service-issued tokens for development and isolated deployments.

### Runtime Flow

1. TTS/Gantt publishes a task event to NATS.
2. `chat-service` validates the event with Zod.
3. The service resolves the task room set for the task, creating missing rooms when allowed by the event policy.
4. The service creates a system message in the relevant room.
5. The service creates notification records for eligible room members.
6. The service updates unread counters through read state/message sequence comparison.
7. The service emits WebSocket events to connected users.
8. The service publishes `chat.message.created` and `chat.notification.created` events.

### HTTP API

The HTTP API is the source of truth for query and command operations:

- Query room list, message history, and notifications.
- Send user messages.
- Mark a room or notification as read.
- Perform permission checks consistently before every read/write operation.

API requests use JSON. All request bodies, params, query strings, and response payloads should be validated or
serialized through explicit schemas.

### WebSocket Gateway

The WebSocket gateway provides low-latency delivery, not durable storage. Clients must treat WebSocket events as
signals and use HTTP APIs to recover missed data after reconnect.

Connection behavior:

- Client connects with an auth token.
- Server validates the token and binds the socket to `userId`.
- Server sends only events the user is allowed to see.
- Client reconnects with last known room/message state and refreshes via HTTP.

The gateway should not trust room subscriptions sent by clients without checking membership.

### NATS Consumers

Consumers ingest TTS/Gantt domain events. They should be idempotent by `eventId` and should store processed event
ids or derive idempotency from source event ids.

Initial subjects:

- `tts.task.status.changed`
- `tts.task.assignee.changed`
- `tts.task.deadline.changed`
- `tts.task.comment.added`

Consumer responsibilities:

- Validate event shape.
- Resolve actor, task, project, and affected users.
- Create task rooms if the task room policy requires it.
- Create system messages.
- Create notifications for users who should be alerted.
- Publish chat-domain events after successful DB transaction.

### PostgreSQL Persistence

PostgreSQL is the authoritative storage. Prisma should model all entities explicitly and keep timestamps,
foreign keys, and indexes visible in schema reviews.

Persistence principles:

- Messages are append-only for MVP.
- Message history is stored permanently.
- Read state is per room and user.
- Notifications are separate from messages because not every message must produce a desktop popup notification.
- Room membership is explicit, even for task rooms whose members originate from TTS.
- External TTS ids are stored as external references, not as internal primary keys.

### Auth Integration

Integrated TTS mode:

- Accept TTS/auth-service access tokens.
- Verify JWT signature locally when public keys/JWKS are available.
- Fall back to token introspection only if local verification is not possible.
- Map token claims to internal `users` rows by stable external user id.
- Sync user display data opportunistically on login or event ingestion.

Standalone mode:

- Store local users in `users`.
- Use local passwordless/dev tokens or locally issued JWTs depending on deployment needs.
- Store room memberships locally.
- Provide admin-only bootstrap operations outside the public MVP API if needed.

## Entities

### users

Represents a chat identity. In integrated mode the row mirrors an external TTS/auth user; in standalone mode it is
owned by `chat-service`.

Fields:

- `id`: UUID primary key.
- `externalUserId`: nullable string; stable TTS/auth-service user id.
- `email`: nullable string; unique when present.
- `displayName`: string.
- `avatarUrl`: nullable string; reserved for later UI use.
- `role`: enum/string; local role such as `user`, `manager`, `admin`, `system`.
- `status`: enum; `active`, `disabled`.
- `authSource`: enum; `tts`, `standalone`, `system`.
- `createdAt`: timestamp.
- `updatedAt`: timestamp.
- `lastSeenAt`: nullable timestamp.

### rooms

Represents a conversation container.

Fields:

- `id`: UUID primary key.
- `type`: enum; `task`, `direct`, `group`, `system`.
- `visibility`: enum; `private`, `restricted`.
- `name`: nullable string; required for group/system rooms, derived for direct rooms.
- `description`: nullable string.
- `taskId`: nullable string; denormalized external task id for task rooms.
- `projectId`: nullable string; denormalized external project id for task rooms.
- `taskRoomKind`: nullable enum; `internal`, `manager`, `customer`, `system-events`.
- `createdByUserId`: nullable UUID; null for system-created rooms.
- `createdByEventId`: nullable string; source event that created the room.
- `lastMessageId`: nullable UUID.
- `lastMessageAt`: nullable timestamp.
- `isArchived`: boolean.
- `createdAt`: timestamp.
- `updatedAt`: timestamp.

### room_members

Represents room access and notification preferences per user.

Fields:

- `id`: UUID primary key.
- `roomId`: UUID foreign key to `rooms`.
- `userId`: UUID foreign key to `users`.
- `role`: enum; `owner`, `manager`, `member`, `observer`, `system`.
- `source`: enum; `tts_task`, `tts_project`, `manual`, `standalone`, `system`.
- `notificationLevel`: enum; `all`, `mentions`, `none`.
- `joinedAt`: timestamp.
- `leftAt`: nullable timestamp.
- `mutedUntil`: nullable timestamp.
- `createdAt`: timestamp.
- `updatedAt`: timestamp.

### messages

Represents an immutable chat message or system event message.

Fields:

- `id`: UUID primary key.
- `roomId`: UUID foreign key to `rooms`.
- `threadId`: nullable UUID foreign key to `message_threads`.
- `senderUserId`: nullable UUID; null for system messages.
- `type`: enum; `text`, `system_event`.
- `body`: nullable string; required for `text`, optional for `system_event`.
- `eventType`: nullable string; for example `task.status.changed`.
- `eventPayload`: JSON; structured metadata for system messages.
- `sourceEventId`: nullable string; idempotency key for system-generated messages.
- `sequence`: monotonic integer per room.
- `createdAt`: timestamp.
- `updatedAt`: timestamp.

### message_threads

Reserved lightweight model for future replies/thread grouping. MVP can store thread roots without adding a full
thread UI.

Fields:

- `id`: UUID primary key.
- `roomId`: UUID foreign key to `rooms`.
- `rootMessageId`: UUID foreign key to `messages`.
- `replyCount`: integer.
- `lastReplyMessageId`: nullable UUID.
- `lastReplyAt`: nullable timestamp.
- `createdAt`: timestamp.
- `updatedAt`: timestamp.

### read_states

Stores per-user read progress for a room.

Fields:

- `id`: UUID primary key.
- `roomId`: UUID foreign key to `rooms`.
- `userId`: UUID foreign key to `users`.
- `lastReadMessageId`: nullable UUID.
- `lastReadSequence`: integer; default `0`.
- `lastReadAt`: nullable timestamp.
- `unreadCountSnapshot`: integer; optional cached count for fast room list rendering.
- `createdAt`: timestamp.
- `updatedAt`: timestamp.

### notifications

Represents a durable notification item for desktop popup delivery and notification center history.

Fields:

- `id`: UUID primary key.
- `userId`: UUID foreign key to `users`.
- `roomId`: nullable UUID foreign key to `rooms`.
- `messageId`: nullable UUID foreign key to `messages`.
- `type`: string; for example `task.status.changed`, `message.created`.
- `title`: string.
- `body`: string.
- `priority`: enum; `low`, `normal`, `high`.
- `payload`: JSON; task id, project id, room id, message id, source event data.
- `deliveryState`: enum; `pending`, `delivered`, `read`, `failed`, `suppressed`.
- `readAt`: nullable timestamp.
- `deliveredAt`: nullable timestamp.
- `sourceEventId`: nullable string.
- `createdAt`: timestamp.
- `updatedAt`: timestamp.

### task_room_links

Maps external task ids to one or more chat rooms.

Fields:

- `id`: UUID primary key.
- `taskId`: string; external TTS/Gantt task id.
- `projectId`: nullable string; external project id.
- `roomId`: UUID foreign key to `rooms`.
- `kind`: enum; `internal`, `manager`, `customer`, `system-events`.
- `source`: enum; `tts`, `standalone`, `manual`.
- `isPrimary`: boolean.
- `createdByEventId`: nullable string.
- `createdAt`: timestamp.
- `updatedAt`: timestamp.

## Room Types

### task

A room tied to a TTS/Gantt task. One task can have multiple task rooms:

- `internal`: working discussion for task participants.
- `manager`: restricted room for managers and selected responsible users.
- `customer`: future external/customer-facing room.
- `system-events`: append-only or restricted room for task lifecycle events.

### direct

A private one-to-one conversation between two users. Direct rooms are not tied to a task, although messages may
later reference task ids.

### group

A manually created multi-user room for team discussion. Group rooms have explicit membership and are not derived
from TTS task membership.

### system

A service-owned room for operational announcements or global system events. Access is controlled by membership or
admin policy.

## Message Types

### text

User-authored plain text message.

Rules:

- Requires authenticated `senderUserId`.
- Requires active membership in the target room.
- Body is required and length-limited.
- Produces `message.created`.
- May produce notifications depending on room type and notification settings.

### system_event

Service-authored message generated from TTS/Gantt or internal system events.

Rules:

- `senderUserId` is null or references a dedicated system user.
- `eventType` and `eventPayload` are required.
- `sourceEventId` should be set for idempotency.
- Body can contain a short human-readable summary.
- Produces notifications according to event-specific routing rules.

## Notification Flow

### `task.status.changed`

Input includes task id, project id, previous status, new status, actor, timestamp, and affected user ids if known.

Flow:

1. Validate payload.
2. Resolve or create task `system-events` room and optionally `internal` room.
3. Sync required members from task/project membership.
4. Create a `system_event` message with `eventType = task.status.changed`.
5. Notify assignee, task participants, watchers, and responsible managers except the actor when suppression is
   configured.
6. Emit `message.created` and `notification.created` over WebSocket.
7. Publish `chat.message.created` and `chat.notification.created`.

### `task.assignee.changed`

Input includes task id, project id, previous assignee ids, new assignee ids, actor, and timestamp.

Flow:

1. Validate payload.
2. Update task room membership for new and removed assignees according to TTS access policy.
3. Create a `system_event` message in `system-events` and optionally `internal`.
4. Notify new assignees, removed assignees when useful, task managers, and watchers.
5. Recompute visibility for task rooms before emitting room events.
6. Emit `room.updated`, `message.created`, `notification.created`, and `read_state.updated` where needed.

### `task.deadline.changed`

Input includes task id, project id, previous deadline, new deadline, actor, timestamp, and priority if available.

Flow:

1. Validate payload.
2. Create a `system_event` message.
3. Notify assignees and managers.
4. Use `high` priority when the new deadline is earlier or overdue; otherwise use `normal`.
5. Emit realtime updates to affected users.

### `task.comment.added`

Input includes task id, project id, comment id, author, text preview, and timestamp.

Flow:

1. Validate payload.
2. Decide whether the external task comment should become a chat `system_event` or a user-visible mirrored message.
3. Create a message in the mapped task room.
4. Notify task participants according to notification preferences.
5. Store external comment id in `eventPayload` for traceability.

## WebSocket Events

All events should include:

- `eventId`: unique event id.
- `type`: event name.
- `occurredAt`: ISO timestamp.
- `payload`: event-specific object.

### `message.created`

Payload:

- `roomId`
- `message`
- `unreadCount`
- `sourceEventId`

Delivered to active room members who can read the message.

### `room.created`

Payload:

- `room`
- `membership`

Delivered to users who became members of the new room.

### `room.updated`

Payload:

- `roomId`
- `changes`
- `membership`

Delivered to current members and, when membership changes, to affected users.

### `read_state.updated`

Payload:

- `roomId`
- `userId`
- `lastReadMessageId`
- `lastReadSequence`
- `unreadCount`

Delivered to the user whose read state changed. Aggregate read receipts for other users are out of MVP.

### `notification.created`

Payload:

- `notification`

Delivered only to the notification recipient.

## Permission Model

### Integrated TTS Mode

Source of truth:

- Auth identity comes from TTS/auth-service.
- Project/task participation and manager roles come from TTS/project/task services.
- `chat-service` stores a local projection for fast permission checks.

Rules:

- A user can list only rooms where they have active `room_members` membership.
- Task rooms are visible to task participants, project participants when configured, and managers.
- `manager` task rooms are visible only to managers and explicitly included users.
- `customer` rooms are reserved for future external participants and should be disabled in MVP unless the TTS
  access model is defined.
- `system-events` rooms are readable by task participants and managers, but writes are service-only.
- User text messages require active membership and non-archived room.
- Membership updates from TTS events should be idempotent and auditable.

### Standalone Mode

Source of truth:

- Local users and room memberships in PostgreSQL.
- Local admin or bootstrap process creates users and memberships.

Rules:

- A user can access only rooms with active `room_members`.
- Admin users can create group/system rooms and manage membership.
- Task room access is controlled by local `task_room_links` and `room_members`.
- Standalone mode should use the same domain logic as integrated mode after identity/membership resolution.

## API Draft

### `GET /rooms`

Returns rooms visible to the current user.

Query:

- `type`: optional room type filter.
- `taskId`: optional external task id filter.
- `limit`: default 50.
- `cursor`: optional pagination cursor.

Response:

- `items`: room summaries with membership, last message, unread count, and task context.
- `nextCursor`: nullable string.

### `GET /rooms/:roomId/messages`

Returns paginated message history for a room.

Params:

- `roomId`: UUID.

Query:

- `limit`: default 50.
- `before`: optional message id or sequence cursor.
- `after`: optional message id or sequence cursor.

Response:

- `items`: messages ordered ascending or descending by selected API convention.
- `nextCursor`: nullable string.

Permission:

- Current user must be an active room member.

### `POST /rooms/:roomId/messages`

Creates a user text message.

Params:

- `roomId`: UUID.

Body:

- `body`: string.
- `threadId`: optional UUID.

Response:

- Created message.

Permission:

- Current user must be an active room member.
- Room must allow user messages.
- `system` and `system-events` rooms may reject user text messages depending on room policy.

### `POST /rooms/:roomId/read`

Marks a room as read up to a message or sequence.

Params:

- `roomId`: UUID.

Body:

- `lastReadMessageId`: optional UUID.
- `lastReadSequence`: optional integer.

Response:

- Updated read state.

Permission:

- Current user must be an active room member.

### `GET /notifications`

Returns notifications for the current user.

Query:

- `state`: optional `unread`, `read`, `all`.
- `limit`: default 50.
- `cursor`: optional pagination cursor.

Response:

- `items`: notification records.
- `nextCursor`: nullable string.

### `POST /notifications/:id/read`

Marks one notification as read.

Params:

- `id`: UUID.

Response:

- Updated notification.

Permission:

- Current user must own the notification.

## NATS Subjects Draft

### Inbound TTS subjects

- `tts.task.status.changed`: task status was changed in TTS/Gantt.
- `tts.task.assignee.changed`: assignee/responsible users changed.
- `tts.task.deadline.changed`: task deadline changed.
- `tts.task.comment.added`: task comment was added in TTS.

### Outbound chat subjects

- `chat.message.created`: emitted after a message is committed.
- `chat.notification.created`: emitted after a notification is committed.

Event envelope:

- `eventId`: unique id.
- `eventType`: subject-compatible type.
- `occurredAt`: source timestamp.
- `producer`: service name.
- `schemaVersion`: integer.
- `payload`: event-specific object.

Delivery rules:

- Consumers must be idempotent by `eventId`.
- Publishing should happen after DB commit.
- If using an outbox table later, NATS publishing should be retried independently from the HTTP/NATS command
  transaction.

## Database Indexes

Recommended indexes:

- `users.externalUserId` unique partial index where not null.
- `users.email` unique partial index where not null.
- `rooms.type`.
- `rooms.taskId`.
- `rooms.projectId`.
- `rooms.lastMessageAt`.
- `rooms(type, taskId, taskRoomKind)` for task room lookup.
- `room_members(userId, leftAt)` for room list.
- `room_members(roomId, leftAt)` for member fanout.
- `room_members(roomId, userId)` unique active membership constraint.
- `messages(roomId, sequence)` unique for message pagination and read state.
- `messages(roomId, createdAt)`.
- `messages(sourceEventId)` unique partial index where not null for idempotent system messages.
- `message_threads(roomId, rootMessageId)`.
- `read_states(userId, roomId)` unique.
- `read_states(roomId, lastReadSequence)`.
- `notifications(userId, readAt, createdAt)` for notification center.
- `notifications(userId, deliveryState, createdAt)` for pending/unread queries.
- `notifications(sourceEventId)` non-unique or unique composite depending on fanout strategy.
- `task_room_links(taskId, kind)` unique when each task has one room per kind.
- `task_room_links(roomId)` unique.

## Risks and Tradeoffs

- Local permission projection can drift from TTS. Mitigation: idempotent sync events, periodic reconciliation, and
  conservative access checks when membership is uncertain.
- WebSocket delivery is not durable. Mitigation: clients refresh room/message/notification state via HTTP after
  reconnect.
- Notification fanout can grow as project sizes grow. MVP load is small, but fanout should be isolated behind a
  notification service/domain module and later moved to jobs if needed.
- Per-room message sequence requires transactional allocation. This is simple for MVP but must be implemented
  carefully to avoid duplicate sequence values under concurrent writes.
- Keeping history forever simplifies MVP but creates storage and compliance questions later.
- Direct/group chat support increases product surface beyond notification delivery. The domain model includes it,
  but implementation can be phased after task rooms.
- NATS event contracts must be versioned early. Unversioned payload changes will break consumers.
- Desktop popup notifications need a client-side runtime. The backend can create and stream notification records,
  but actual OS popups depend on the desktop/web shell.
- Standalone auth can become a second auth product. Keep it minimal and reuse the same authorization domain after
  identity resolution.

## Phased Roadmap

### Phase 1: notification + task rooms

- Create standalone `chat-service` repository.
- Implement Fastify, TypeScript strict config, Zod, pino, Vitest, PostgreSQL, Prisma.
- Model users, task rooms, memberships, messages, read states, notifications, and task room links.
- Consume TTS task events.
- Create system messages and notification records.
- Expose room/message/notification HTTP APIs.

### Phase 2: direct/group chats

- Add direct room creation and deterministic direct room lookup.
- Add group room creation and membership management.
- Support user text messages in direct, group, and task rooms.
- Extend unread counters and notification preferences.

### Phase 3: desktop realtime

- Add WebSocket gateway.
- Stream `message.created`, `room.created`, `room.updated`, `read_state.updated`, and `notification.created`.
- Add reconnect/recovery behavior through HTTP refresh.
- Integrate desktop popup client behavior in the consuming TTS shell.

### Phase 4: attachments

- Add attachment metadata entities.
- Add storage provider abstraction.
- Add upload/download authorization.
- Add image/file preview policy.

### Phase 5: search and retention policies

- Add simple message search first, then evaluate PostgreSQL full-text search or a separate search backend.
- Define retention and archival policies.
- Add audit/compliance export paths if required.

## Open Questions

- Which TTS service is the authoritative source for project/task membership and manager roles?
- Should every task always have all four room kinds, or should rooms be created lazily by event/type?
- Should `task.comment.added` be mirrored as a chat message, a system event, or only a notification?
- Are customers/external users in scope for the first real deployment, or should `customer` rooms remain reserved?
- What desktop client or web shell will render OS-level popup notifications?
- Should managers see all project task rooms by default, or only rooms for tasks assigned to their teams?
- What is the expected maximum message retention period once compliance requirements are known?
- Do TTS task events already have stable `eventId` values, or must `chat-service` derive idempotency keys?
