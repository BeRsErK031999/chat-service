# Chat UI Embedding

`frontend/src/chat-ui` is the reusable host-facing layer for embedding chat into a desktop shell or web gantt later.
The current `/chat/` playground remains the only integration in this step.

For host adapter patterns and the staged desktop/web plan, see [Host Integration Plan](./host-integration-plan.md).

This step does not add desktop integration, web gantt integration, production auth, package publishing, Storybook,
Docker changes, NATS, or WebSocket transport.

## Public Component

Hosts embed `ChatWidget` from `frontend/src/chat-ui`:

```tsx
import { ChatWidget } from './chat-ui';
import type { ChatWidgetCallbacks, ChatWidgetUser } from './chat-ui';

const currentUser: ChatWidgetUser = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Artem',
};

const callbacks: ChatWidgetCallbacks = {
  onUnreadCountChange: (count) => updateHostBadge(count),
  onClose: () => closeHostPanel(),
};

<ChatWidget apiBaseUrl="/chat/api" currentUser={currentUser} mode="full" callbacks={callbacks} />;
```

If `auth` is omitted, the widget uses `currentUser.id` as dev auth:

```ts
{
  strategy: 'dev-user-id',
  userId: currentUser.id,
}
```

## Props

| Prop             | Required | Description                                                                                                                 |
| ---------------- | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| `apiBaseUrl`     | yes      | Base HTTP API path, for example `/chat/api`. SSE events are built from this value.                                          |
| `currentUser`    | yes      | Host-provided user identity with `id` and `displayName`.                                                                    |
| `auth`           | no       | Auth strategy. Defaults to dev `x-user-id` based on `currentUser.id`.                                                       |
| `context`        | no       | Host context for room/task embedding. Supports `taskId`, `roomId`, `roomScope`, and `source`.                               |
| `initialRoomId`  | no       | Backward-compatible room id to select on load. `context.roomId` takes precedence.                                           |
| `mode`           | no       | `"full"`, `"embedded"`, or `"compact"`. Defaults to `"full"`. Compact hides notifications.                                  |
| `enableRealtime` | no       | Enables SSE realtime when `true`. Defaults to `true`; polling fallback still runs when disconnected.                        |
| `className`      | no       | Optional class added to the widget shell for host-specific layout.                                                          |
| `callbacks`      | no       | Host callbacks for unread count, room changes, message sent, auth/access errors, realtime status, close, and notifications. |
| `labels`         | no       | Host text overrides for title and empty states.                                                                             |

## Styling / CSS Isolation

`ChatWidget` imports `frontend/src/chat-ui/chat-widget.css` from inside the reusable `chat-ui` module. Its internal
classes are prefixed with `chat-ui-` and scoped under `.chat-ui-root`, including the local box-sizing reset.

The app-level `frontend/src/styles.css` is not part of the reusable widget contract. Playground-only styling lives in
`frontend/src/playground/playground.css`.

Hosts can pass `className` to size or position the widget root:

```tsx
<ChatWidget className="host-chat-panel" mode="embedded" {...props} />
```

Shadow DOM is not used yet. Host applications should avoid broad global CSS, highly specific element selectors, and
`!important` rules that target generic descendants, because those can still override normal scoped widget styles.

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
/>
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
/>
```

## Auth Status

Auth is still temporary. The backend currently accepts dev identity through:

- HTTP `x-user-id`
- SSE `?userId=` query parameter for `EventSource`

The widget centralizes auth handling in the frontend API/realtime client. `dev-user-id` is the only strategy that works
end-to-end with the current backend. `cookie` and `bearer` are contract placeholders for a later production auth step;
they do not make the backend production-authenticated in this phase.

## Room Context

If `context.roomId` or `initialRoomId` is provided, `ChatWidget` tries to open that room after `/rooms` loads.
`context.roomId` takes precedence over `initialRoomId`.

If the requested room is not present in the loaded rooms, the widget clears the selection, shows an access message, and
calls `callbacks.onAccessDenied` when provided.

If `context.roomId` is not provided and `context.taskId + context.roomScope` are present, `ChatWidget` calls:

```text
GET /task-rooms/lookup?taskId=<taskId>&roomScope=<roomScope>
```

The backend returns a room only when the current dev-authenticated user is an active member. Missing links, missing
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
/>
```

## Layer Ownership

The reusable layer owns:

- `ChatWidget`
- host-facing public types
- API client creation from `apiBaseUrl` and `auth`
- SSE realtime hook with connected/disconnected state callback
- polling fallback refresh trigger
- room list, message list, composer, notifications panel, and realtime status components

The playground layer owns:

- Artem and Tester dev user ids
- the dev user switcher
- the `/chat/` internal testing wrapper
- default playground API base URL from `VITE_API_BASE_URL ?? '/chat/api'`

Dev users must not be imported into `frontend/src/chat-ui`.

## Current Limits

- Auth is not production-ready.
- Task room lookup does not auto-create missing rooms.
- Task room lookup only checks current room membership; organization/project ACLs are not implemented in this step.
- CSS is scoped by `chat-ui-` class names, but Shadow DOM isolation is not implemented.
- SSE remains the realtime transport; WebSocket is intentionally not added.
- No desktop shell or web gantt integration exists yet.
