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
| `navigationTarget` | no | Platform-neutral room/message target for notification routing. New `id` values select `roomId`; `messageId` is highlighted when it is in the loaded message window. |
| `mode` | no | `"full"`, `"embedded"`, or `"compact"`. Defaults to `"full"`. Compact hides notifications. |
| `enableRealtime` | no | Enables SSE realtime when `true`. Defaults to `true`; polling fallback still runs when disconnected. |
| `className` | no | Optional class added to the widget shell for host-specific layout. |
| `callbacks` | no | Host callbacks for unread count, room changes, navigation/activity/interaction observations, message sent, task actions, auth/access errors, realtime status, close, and notifications. |
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

type ChatWidgetNavigationTarget = {
  id?: string;
  roomId?: string;
  messageId?: string;
  taskId?: string;
  source?: 'notification' | 'task' | 'activity';
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
  onNavigationTargetChange?: (target: NormalizedChatWidgetNavigationTarget | null) => void;
  onActivityItemsChange?: (items: ChatActivityItem[]) => void;
  onInteractionHintsChange?: (hints: ChatInteractionHint[]) => void;
  onMessageSent?: (message: Message) => void;
  onTaskOpen?: (taskId: string) => void;
  onTaskReferenceCopy?: (taskReference: string) => void;
  onNotificationClick?: (notification: Notification) => void;
  onNotificationReceived?: (notification: Notification) => void;
  onAuthError?: (error: Error) => void;
  onAccessDenied?: (error: Error) => void;
  onRealtimeStatusChange?: (status: RealtimeStatus) => void;
  onRealtimeDiagnostic?: (diagnostic: ChatRealtimeDiagnostic) => void;
  onClose?: () => void;
};
```

`onUnreadCountChange` is called only when the calculated total changes. The current total is:

- sum of unread room counts from `/rooms`
- plus unread notifications from `/notifications`

`onRoomChange` fires when the selected room id changes. `onClose` only adds a close button when the host provides the
callback, so the playground does not show close controls.

`onTaskOpen` and `onTaskReferenceCopy` are platform-neutral workflow action hooks. The reusable widget only emits the
task id or task reference; desktop shells, browser shells, and future hosts decide how to open tasks or write to a
host-safe clipboard. If `onTaskReferenceCopy` is not provided, the browser widget attempts `navigator.clipboard`.

`onNavigationTargetChange` is the platform-neutral continuity hook. It emits the selected room as a normalized
navigation target with room, optional task, and source semantics so hosts can restore the same workflow entry point
after reopen or reconnect.

## Navigation Target Model

`ChatWidgetNavigationTarget` is the lightweight deep-link foundation for room, task, message, notification, and future
activity/inbox entry points:

```ts
{
  roomId?: string;
  messageId?: string;
  taskId?: string;
  source?: 'notification' | 'task' | 'activity';
}
```

Rules:

- `roomId` selects a room when the authenticated user can see it.
- `messageId` is best-effort highlighting inside the loaded message window.
- `taskId` preserves workflow context and primes recent task continuity; it does not create task rooms.
- `source` records intent for notification, task, and future activity-feed surfaces.
- empty strings and unsupported sources are dropped by `normalizeNavigationTarget`.
- `serializeCanonicalNavigationTarget` emits a versioned `chat-nav:v1?...` string with stable field ordering for
  future deep links, reopen continuity, activity restoration, and cross-entry workflow navigation.
- `parseNavigationTarget` accepts both the canonical serialized form and legacy query-string targets without
  introducing a router framework.
- `rememberNavigationTarget`, `getRememberedNavigationTarget`, and `clearRememberedNavigationTarget` provide
  session-local continuity restore. They store only the canonical target string and timestamp in `sessionStorage`, with
  an in-memory fallback when browser storage is unavailable.
- A remembered target is an initial restore hint only. After mount, normal room clicks, Back, Recent task, notification
  routing, and activity clicks must stay internally navigable and must not be pinned by the restored room id.
- Malformed, stale, or non-canonical storage values are skipped without crashing. Diagnostics may report
  `navigation_target_restore_failed` or `navigation_target_restore_skipped`, but must not include secrets, bearer
  tokens, access tokens, message bodies, notification bodies, or user display names.
- `navigationTargetFromNotification` maps backend notifications into the same model; notifications without a room use
  safe host fallback behavior.

This intentionally does not add browser history redesign, Electron protocol handlers, backend deep-link APIs, backend
persistence, or an activity feed.

## Activity Target Foundation

`chat-ui` also exposes lightweight activity helpers that derive activity items from data the widget already loads:

- notifications from `/notifications`;
- unread room counts and room metadata from `/rooms`;
- `lastMessageAt` and latest message preview from room list items;
- navigation targets from the shared target model.

`ChatActivityItem` is a platform-neutral reference for future inbox, activity feed, and attention-needed surfaces:

```ts
type ChatActivityItem = {
  id: string;
  kind: 'notification' | 'unread-room' | 'recent-room';
  attentionState: 'attention-needed' | 'recent' | 'read';
  target: NormalizedChatWidgetNavigationTarget;
  roomId?: string;
  messageId?: string;
  taskId?: string;
  title: string;
  summary?: string;
  occurredAt: string;
};
```

Rules:

- unread notifications and unread rooms become `attention-needed`;
- read notifications remain addressable as `read` activity;
- rooms with recent messages become `recent-room` activity;
- activity targets reuse the same room/message/task continuity semantics as notification routing;
- ordering is intentionally simple: attention-needed first, then most recent timestamp;
- `onActivityItemsChange` lets hosts observe the derived list without adding a feed UI.
- The embedded ActivityPanel renders Needs attention and Recent activity from this derived list. Attention-heavy rooms
  must not hide the Recent activity section in a way that prevents smoke coverage.

This is not a backend inbox, durable activity stream, notification microservice, analytics/ranking engine, pagination
model, or heavy UI redesign.

## Interaction Hint Foundation

`chat-ui` exposes a minimal interaction hint model for future typing indicators and richer activity hints. The current
foundation is local/shared only; it does not send typing events to the backend and does not render a production typing
UI.

```ts
type ChatInteractionHint = {
  id: string;
  kind: 'typing' | 'viewing' | 'active_in_room';
  roomId: string;
  userId: string;
  occurredAt: string;
  expiresAt: string;
  debounceMs: number;
  staleAfterMs: number;
  taskId?: string;
  messageId?: string;
};
```

Rules:

- hints are ephemeral and never persisted;
- hints do not create notifications, unread counts, read states, or activity items by themselves;
- hints do not create backend requests and do not trigger SSE reconnects;
- default debounce is 3 seconds and default stale timeout is 10 seconds;
- `normalizeInteractionHint` drops hints without room/user identity;
- `pruneStaleInteractionHints` removes expired hints for future host-side display;
- `shouldEmitInteractionHint` prevents noisy repeated updates inside the debounce window;
- `ChatWidget` can emit local `viewing` or `active_in_room` hints through `onInteractionHintsChange` without changing
  the SSE connection lifecycle.

Future backend integration, if needed, should use an ephemeral SSE shape such as `room.activity` or `room.typing` with
room membership fanout, explicit throttling, stale expiry, no persistence, no notifications, and no unread impact.
Those event names are documented-only future shapes in this slice; there is no backend fanout or production typing
indicator UI.

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
    onTaskOpen: (taskId) => shellTasks.open(taskId),
    onTaskReferenceCopy: (taskReference) => shellClipboard.writeText(taskReference),
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
    onTaskOpen: (taskId) => openTask(taskId),
    onTaskReferenceCopy: (taskReference) => copyToClipboard(taskReference),
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

## Task-Centric UX

The first task-centric UX layer is implemented inside the reusable `frontend/src/chat-ui` source of truth without new
backend contract requirements.

Audit summary:

- `ChatWidget` owns rooms state from `GET /rooms`, messages state from `GET /rooms/:roomId/messages`, notifications
  state from `GET /notifications`, draft/send state, selected room state, and optimistic local message state.
- `useChatRealtime` owns the SSE lifecycle and emits refresh callbacks for `message.created`, `notification.created`,
  `notification.read`, `room.read`, and `presence.changed`.
- Optimistic send/retry stays in `ChatWidget`: failed local messages keep the original `Idempotency-Key` and retry
  through the same API client path.
- `/rooms` already provides `type`, `taskId`, `projectId`, `taskRoomKind`, `lastMessage`, and `unreadCount`.
- `/task-rooms/lookup` already provides `roomId`, `taskId`, `roomScope`, and `roomName` for host task context.
- The minimal UX extension points are the room list, room header, message metadata, and presence event state; no route,
  auth, or transport changes are needed.

Current task-centric UI behavior:

- Task rooms are grouped above ordinary recent conversations.
- Rooms are ordered unread-first and then by recent activity inside each group.
- The room list includes a local search/filter box covering room name, type, scope, task id, project id, and latest
  message preview.
- Keyboard workflow supports `Ctrl`/`Cmd+K` or `/` to focus room search, `ArrowUp`/`ArrowDown` to switch visible rooms,
  `Enter` to open the first match, and `Escape` to clear or leave search.
- Selecting a room focuses the composer so daily task discussion flow is search, open, type.
- Command-like workflow actions are available in the room header: jump to task, copy task reference, open a related
  discussion, mark read, mark unread, reopen a recent task room, jump to next unread, and return to the previous
  discussion.
- Keyboard traversal also supports `Alt+ArrowUp`/`Alt+ArrowDown` for previous/next room,
  `Alt+Shift+ArrowUp`/`Alt+Shift+ArrowDown` for previous/next unread room, `Ctrl`/`Cmd+Shift+A` for active discussion
  cycling, and `Ctrl`/`Cmd+Shift+L` to return to the previous discussion.
- Hosts can route notification clicks by passing `navigationTarget`; room selection is guaranteed, while message
  highlight is best-effort for messages present in the currently loaded message window.
- Hosts can preserve task/discussion context after shell reopen by storing the last observed
  `onNavigationTargetChange` value and passing its room back as `initialRoomId`. `context.roomId` still takes
  precedence for explicit routing.
- Hosts can prepare future inbox/feed surfaces by observing `onActivityItemsChange`; these items are derived from
  existing notifications and rooms and should route through their embedded navigation targets.
- Hosts can prepare future typing/activity affordances by observing `onInteractionHintsChange`; these hints are
  ephemeral and should be debounced and expired before display.
- Task rooms get a task discussion label and stronger unread badge styling.
- Room rows show existing room type/scope metadata when available.
- Room rows now surface lightweight workflow awareness from existing room data: unread rooms are marked as needing
  attention, caught-up rooms show relative recent activity, and task discussions keep the stronger unread treatment.
- The active room header shows task discussion, scope, task reference, and host source chips when those values are
  already known.
- The active room header also shows caught-up/unread state, last activity, and known active participants inferred from
  visible messages plus existing `presence.changed` state.
- Notifications are ordered unread-first and recent-first, with priority/read labels for quicker attention scanning.
- Direct, group, system, internal, manager, customer, and system-events differences are rendered as lightweight labels
  rather than a new room model.

Current presence UI behavior:

- Presence remains SSE-only through existing `presence.changed` events.
- The widget stores lightweight presence state in memory by user id.
- Message metadata renders an online/offline dot and formatted last-seen tooltip when presence is known.
- The current user indicator follows the active realtime connection state.

## Layer Ownership

The reusable layer owns:

- `ChatWidget`
- host-facing public types
- platform-neutral navigation target helpers for normalize, parse, serialize, room, and notification targets
- platform-neutral activity helpers for notification, unread-room, recent-room, and attention-needed references
- platform-neutral interaction hint helpers for typing, viewing, active-in-room, debounce, and stale expiry semantics
- API client creation from `apiBaseUrl` and `auth`
- SSE realtime hook with connecting/connected/disconnected state callback
- stable `EventSource` lifecycle across room switching through refs for selected room and refresh handlers
- sanitized realtime diagnostics callback for opt-in smoke logging without tokens, URLs, headers, names, bodies, or
  secrets; payloads may include lifecycle counters, reconnect timestamps, reconnect reason, room count, and unread count
- polling fallback refresh trigger, browser online recovery, and bfcache `pageshow` recovery
- duplicate realtime event protection for message, notification, and room-read refreshes
- room list, message list, composer, notifications panel, and realtime status components
- optimistic message send state with retry using the original `Idempotency-Key`
- lightweight presence events over the existing SSE connection
- task-centric room grouping, scope labels, contextual room header metadata, and presence indicators
- workflow awareness cues derived from existing rooms, notifications, visible messages, and SSE presence state
- command-like navigation/action behavior, including unread traversal, active discussion cycling, previous discussion
  return, recent task room recall, local mark-unread emphasis, and platform-neutral task action callbacks
- platform-neutral target semantics for future activity feed, inbox, and attention-needed surfaces
- derived activity item callbacks without owning feed rendering or pagination
- local interaction hint callbacks without backend fanout or production typing UI

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
- Mark unread is a local attention-management affordance in the widget; the current backend API only persists mark read.
- Message highlighting through `navigationTarget.messageId` is best-effort for messages present in the loaded message
  window.
- Navigation targets do not add browser history, Electron protocol handlers, backend lookup redesign, or a full router.
- Activity items are derived client-side from currently loaded rooms and notifications; they are not a durable inbox or
  ranked activity feed.
- Interaction hints are local/shared foundation only; no backend typing fanout is enabled yet.
- Browser automation smoke may be unavailable in some local Codex sessions; do not record browser playground success
  unless the browser tooling actually ran.

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

## Activity Continuity Baseline on 2026-05-26

Live native Electron smoke against the desktop runtime verified the current production-capable activity continuity
baseline:

- ActivityPanel was visible in the desktop overlay and rendered Needs attention plus Recent activity from loaded rooms
  and notifications.
- Activity and notification clicks used normalized canonical targets such as
  `chat-nav:v1?roomId=...&messageId=...&source=notification`.
- Overlay close/reopen restored the remembered canonical target through local continuity storage.
- `messageId` highlight restored after close/reopen when the target message was in the loaded message window.
- Task discussion restore reopened `task-123/internal` with the task context intact.
- Malformed `sessionStorage` did not crash the widget and produced a sanitized restore-failed diagnostic.
- The restore pinning bug was caught and fixed: remembered targets now seed only the initial room request and do not
  remain as a persistent requested room id.
- Post-restore Back, Recent task, ordinary room clicks, and activity clicks remained internal ChatWidget navigation, not
  parent-controlled navigation.
- Runtime counters stayed healthy during normal restore/reopen: one active EventSource per open widget, no leak markers,
  no duplicate events, no duplicate-connection prevention, and no reconnect failures.
- Storage and diagnostics contained no bearer tokens, `accessToken` values, shared secrets, Authorization headers,
  message bodies, notification bodies, or display names.
