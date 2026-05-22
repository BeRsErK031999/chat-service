# Chat UI Embedding

`frontend/src/chat-ui` is the reusable host-facing layer for embedding chat into a desktop shell or web gantt later.
The current `/chat/` playground remains the only integration in this step.

This layer supports desktop/web host integration through the internal bearer auth bridge. It still does not add OAuth,
package publishing, Storybook, NATS, or WebSocket transport.

## Public Component

Hosts embed `ChatWidget` from `frontend/src/chat-ui`:

```tsx
import { ChatWidget } from './chat-ui';

<ChatWidget
  apiBaseUrl="/chat/api"
  currentUser={{
    id: '11111111-1111-4111-8111-111111111111',
    displayName: 'Artem',
  }}
  mode="full"
/>;
```

If `auth` is omitted, the widget uses `currentUser.id` as dev auth. Production hosts should pass bearer auth explicitly:

```ts
{
  strategy: 'bearer',
  token: chatInternalToken,
}
```

## Props

| Prop | Required | Description |
| --- | --- | --- |
| `apiBaseUrl` | yes | Base HTTP API path, for example `/chat/api`. SSE events are built from this value. |
| `currentUser` | yes | Host-provided user identity with `id` and `displayName`. |
| `auth` | no | Auth strategy. Defaults to dev `x-user-id` based on `currentUser.id`. |
| `context` | no | Host context for room/task embedding. Supports `taskId`, `roomId`, `roomScope`, and `source`. |
| `initialRoomId` | no | Backward-compatible room id to select on load. `context.roomId` takes precedence. |
| `mode` | no | `"full"`, `"embedded"`, or `"compact"`. Defaults to `"full"`. Compact hides notifications. |
| `enableRealtime` | no | Enables SSE realtime when `true`. Defaults to `true`; polling fallback still runs when disconnected. |
| `className` | no | Optional class added to the widget shell for host-specific layout. |
| `callbacks` | no | Host callbacks for unread count, room changes, message sent, auth/access errors, realtime status, close, and notifications. |
| `labels` | no | Host text overrides for title and empty states. |

## Types

```ts
type ChatWidgetUser = {
  id: string;
  displayName: string;
};

type ChatWidgetMode = 'full' | 'embedded' | 'compact';

type ChatWidgetContext = {
  taskId?: string;
  roomId?: string;
  roomScope?: 'internal' | 'manager' | 'customer' | 'system-events';
  source?: 'playground' | 'desktop' | 'web';
};

type ChatWidgetAuth =
  | { strategy: 'dev-user-id'; userId: string }
  | { strategy: 'cookie' }
  | { strategy: 'bearer'; token?: string };
```

## Callbacks

```ts
type ChatWidgetCallbacks = {
  onUnreadCountChange?: (count: number) => void;
  onRoomChange?: (roomId: string | null) => void;
  onMessageSent?: (message: Message) => void;
  onNotificationClick?: (notification: Notification) => void;
  onAuthError?: (error: Error) => void;
  onAccessDenied?: (error: Error) => void;
  onRealtimeStatusChange?: (status: RealtimeStatus) => void;
  onClose?: () => void;
};
```

`onUnreadCountChange` is called only when the calculated total changes. The current total is:

- sum of unread room counts from `/rooms`
- plus unread notifications from `/notifications`

`onRoomChange` fires when the selected room id changes. `onClose` only adds a close button when the host provides the
callback, so the playground does not show close controls.

## Desktop Example

```tsx
<ChatWidget
  apiBaseUrl={desktopConfig.chatApiBaseUrl}
  currentUser={{
    id: shellUser.id,
    displayName: shellUser.name,
  }}
  auth={{
    strategy: 'dev-user-id',
    userId: shellUser.id,
  }}
  context={{
    source: 'desktop',
    taskId: activeTask.id,
    roomScope: 'internal',
  }}
  mode="embedded"
  callbacks={{
    onUnreadCountChange: (count) => shellBadges.setChatUnread(count),
    onRoomChange: (roomId) => shellState.setChatRoomId(roomId),
    onAccessDenied: (error) => shellToasts.error(error.message),
    onRealtimeStatusChange: (status) => shellTelemetry.chatRealtime(status),
    onClose: () => shellPanels.close('chat'),
  }}
  labels={{
    title: 'Task chat',
    selectRoomEmpty: 'Select a task chat.',
  }}
/>;
```

## Web Gantt Example

```tsx
<ChatWidget
  apiBaseUrl="/chat/api"
  currentUser={{
    id: currentUser.id,
    displayName: currentUser.displayName,
  }}
  context={{
    source: 'web',
    taskId: selectedTask.id,
    roomScope: 'manager',
  }}
  mode="compact"
  callbacks={{
    onUnreadCountChange: setChatUnreadCount,
    onMessageSent: (message) => analytics.track('chat_message_sent', { roomId: message.roomId }),
    onNotificationClick: (notification) => openTaskFromNotification(notification),
    onAuthError: () => redirectToLogin(),
    onAccessDenied: (error) => showToast(error.message),
  }}
/>;
```

## Auth

Production hosts create a short-lived internal token using the shared `CHAT_INTERNAL_AUTH_SECRET` and pass it to the
widget:

```tsx
<ChatWidget
  apiBaseUrl="/chat/api"
  currentUser={currentUser}
  auth={{
    strategy: 'bearer',
    token: chatInternalToken,
  }}
/>
```

HTTP requests send:

```text
Authorization: Bearer <chat-internal-token>
```

The token is an HS256 JWT-style token with `userId`, `displayName`, `issuedAt`, `expiresAt`, and `source` (`desktop`,
`web`, or `playground`). `expiresAt` is required and expired tokens are rejected with `401`.

For SSE, browser `EventSource` cannot set custom headers. The widget therefore appends the same short-lived token:

```text
/events?accessToken=<chat-internal-token>
```

This is a compatibility fallback. Keep token TTL short and avoid logging query strings in production.

Dev compatibility remains available only when the backend has `CHAT_ALLOW_DEV_USER_ID=true`:

- HTTP `x-user-id`
- SSE `/events?userId=<uuid>`

Set `CHAT_ALLOW_DEV_USER_ID=false` in production.

Staging bearer smoke on 2026-05-21 used `CHAT_ALLOW_DEV_USER_ID=false`: `x-user-id` HTTP auth and
`/events?userId=<uuid>` both returned `401`, while bearer HTTP and bearer SSE via `accessToken` worked. The desktop
renderer did not receive `CHAT_INTERNAL_AUTH_SECRET`; Electron main signed the short-lived token. Browser playgrounds
that still depend on dev-user-id need bearer support before they can act as a production-style smoke client.

## Room Context

If `context.roomId` or `initialRoomId` is provided, `ChatWidget` tries to open that room after `/rooms` loads.
`context.roomId` takes precedence over `initialRoomId`.

If the requested room is not present in the loaded rooms, the widget clears the selection, shows an access message, and
calls `callbacks.onAccessDenied` when provided.

If `context.roomId` is not provided and `context.taskId + context.roomScope` are present, `ChatWidget` calls:

```text
GET /task-rooms/lookup?taskId=<taskId>&roomScope=<roomScope>
```

The backend returns a room only when the authenticated user is an active member. Missing links, missing
rooms, and rooms where the user is not an active member all return `404`.

Minimal task-context embed:

```tsx
<ChatWidget
  apiBaseUrl="/chat/api"
  currentUser={currentUser}
  context={{
    taskId: 'task-123',
    roomScope: 'internal',
    source: 'desktop',
  }}
/>;
```

## Layer Ownership

The reusable layer owns:

- `ChatWidget`
- host-facing public types
- API client creation from `apiBaseUrl` and `auth`
- SSE realtime hook with connecting/connected/disconnected state callback
- polling fallback refresh trigger, browser online recovery, and bfcache `pageshow` recovery
- duplicate realtime event protection for message, notification, and room-read refreshes
- room list, message list, composer, notifications panel, and realtime status components
- optimistic message send state with retry using the original `Idempotency-Key`
- lightweight presence events over the existing SSE connection

The playground layer owns:

- Artem and Tester dev user ids
- the auth switcher for dev-user-id and manually pasted bearer tokens
- the `/chat/` internal testing wrapper
- default playground API base URL from `VITE_API_BASE_URL ?? '/chat/api'`

Dev users must not be imported into `frontend/src/chat-ui`.
Bearer mode is the production-style smoke path for staging with `CHAT_ALLOW_DEV_USER_ID=false`; the browser never signs
tokens and never receives `CHAT_INTERNAL_AUTH_SECRET`.

## Current Limits

- Host apps must manage chat token refresh and shared-secret distribution.
- Task room lookup does not auto-create missing rooms.
- Task room lookup only checks current room membership; organization/project ACLs are not implemented in this step.
- The chat UI is still styled by the app-level `frontend/src/styles.css`.
- SSE remains the realtime transport; WebSocket is intentionally not added.
- Presence uses in-process SSE connection state plus `User.lastSeenAt`; it is not a durable global fanout layer.
- No desktop shell or web gantt integration exists yet.

## Staging Presence/Reconnection Smoke on 2026-05-22

Staging was redeployed from commit `1ea2df0046453a058b8ec173e3548d6fe5c55387` and `/chat/api/health` returned
`{"status":"ok"}`. Production-style auth stayed intact: `x-user-id` `/rooms` and `/events?userId=<uuid>` returned
`401`, while short-lived bearer tokens loaded `/rooms` and connected to `/events?accessToken=<token>`.

The live API/SSE smoke passed:

- `presence.changed` online was emitted when Artem opened an SSE stream and was seen by Tester.
- Two concurrent Artem SSE streams did not emit a false offline when only one stream closed.
- Closing the remaining Artem stream emitted offline and updated `User.lastSeenAt`.
- Desktop-source Artem and playground-source Tester bearer clients exchanged messages through `Direct Chat`.
- `message.created`, `notification.created`, and `room.read` arrived over SSE.
- Reusing the same `Idempotency-Key` for a retry returned the same message id and left only one message copy.
- Restarting the staging app container closed the old SSE stream, `/health` recovered, `/rooms` stayed available, and a
  new bearer SSE stream connected.

No WebSocket, NATS, Redis presence, Kubernetes, or durable fanout layer was needed for this phase.
