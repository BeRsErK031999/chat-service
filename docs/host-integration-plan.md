# Host Integration Plan

`frontend/src/chat-ui` is the reusable ChatWidget module. Desktop shell and web gantt should adapt their local host
state into this contract instead of copying playground code.

## Why Reuse ChatWidget

The playground is a development host. It owns dev user switching, local API defaults, and manual test controls. Copying it
into desktop or web would copy test-only behavior and make future fixes diverge across hosts.

`ChatWidget` keeps the chat implementation in one place:

- HTTP API calls and SSE realtime wiring
- room loading and task room lookup
- message sending and read state updates
- notifications rendering
- host-facing callbacks and labels

Host apps should own only host state, layout placement, auth bridging, and product-specific reactions to callbacks.

## Desktop Shell Integration

Desktop should create a small adapter near its shell chat panel. The adapter maps desktop user/task state into
`ChatWidgetProps`:

```tsx
import { ChatWidget } from '../chat-ui';
import type { ChatWidgetCallbacks, ChatWidgetUser } from '../chat-ui';
```

Use `frontend/src/chat-ui/adapters/desktopAdapter.example.tsx` as the pattern. It shows:

- `currentUser` built from the desktop host user
- `apiBaseUrl` supplied by desktop shell configuration
- `context.taskId + context.roomScope` with `source: 'desktop'`
- `mode="embedded"` or `mode="compact"`
- callbacks wired to shell badges, panel state, telemetry, access handling, and close behavior

## Web Gantt Integration

Web gantt should keep selected task state in the gantt/drawer layer and render `ChatWidget` only while the panel is open.
Use `frontend/src/chat-ui/adapters/webGanttAdapter.example.tsx` as the pattern. It shows:

- `selectedTaskId` stored by the host
- chat opened from a selected task
- drawer close implemented through `callbacks.onClose`
- `context` set to `{ taskId, roomScope: 'internal', source: 'web' }`
- `mode="embedded"`

## Required Props

Hosts must provide:

- `apiBaseUrl`: base path for chat HTTP API and SSE, for example `/chat/api`
- `currentUser`: `{ id, displayName }` from the host identity

Task embeds should also provide:

- `context.taskId`
- `context.roomScope`
- `context.source`

Room embeds may provide `context.roomId` instead. `context.roomId` takes precedence over `initialRoomId`.

## Host Callbacks

Hosts should handle these callbacks before real integration:

- `onUnreadCountChange`: update shell or page unread badges
- `onRoomChange`: persist or observe the active room
- `onMessageSent`: analytics, activity refresh, or local host side effects
- `onAccessDenied`: show a host-level access/error message
- `onRealtimeStatusChange`: expose realtime state if the host has status UI or telemetry
- `onClose`: close desktop panel or web drawer

`onAuthError` and `onNotificationClick` are also available, but production behavior depends on the future auth and
navigation bridge.

## Task Room Lookup

When `context.taskId + context.roomScope` are provided and no explicit room id is set, `ChatWidget` calls task room
lookup and opens the returned room. `roomScope` selects the task conversation kind, such as `internal`, `manager`,
`customer`, or `system-events`.

The backend currently returns a room only if the authenticated user is an active member. Missing task-room links,
missing rooms, and inaccessible rooms are surfaced as unavailable to the widget and should be treated by hosts as access
denied or not provisioned.

## Current Auth Limits

The working end-to-end auth path is development identity:

- HTTP uses `x-user-id`
- SSE uses a `userId` query parameter
- `ChatWidget` can default to `auth.strategy: 'dev-user-id'` from `currentUser.id`

`cookie` and `bearer` exist as frontend contract placeholders. They do not make the backend production-authenticated in
this step.

Production auth bridge is a separate step. It should define how desktop and web provide identity, session credentials,
SSE authentication, refresh behavior, and failure handling.

## Styling And Isolation

`ChatWidget` now imports its own stylesheet from `frontend/src/chat-ui/chat-widget.css`. Widget selectors use the
`chat-ui-` prefix and are rooted at `.chat-ui-root`, for example `.chat-ui-sidebar`, `.chat-ui-room-list`,
`.chat-ui-message-list`, `.chat-ui-composer`, `.chat-ui-notifications`, and `.chat-ui-status`.

The reusable stylesheet may use a scoped reset only inside the widget root:

```css
.chat-ui-root,
.chat-ui-root *,
.chat-ui-root *::before,
.chat-ui-root *::after {
  box-sizing: border-box;
}
```

It must not define app-wide selectors such as global `button`, `input`, `textarea`, `*`, `body`, or `html`. Playground
styling lives outside the reusable module in `frontend/src/playground/playground.css`, while `frontend/src/styles.css`
keeps only the playground app-level globals.

Hosts can pass `className` to `ChatWidget` when they need to size or position the host container:

```tsx
<ChatWidget className="desktop-chat-panel__widget" mode="embedded" {...props} />
```

That class is appended to the same root element as `.chat-ui-root`. Host CSS should use it for outer layout only and
avoid restyling widget internals.

Shadow DOM is not used in this phase. This keeps the component simple for the current Vite/React setup, but it means
very broad host CSS can still leak into the widget if it uses highly specific selectors, `!important`, inherited
typography rules, or global element resets. Before real desktop or web integration, host apps should audit their global
CSS and prefer placing layout rules on the wrapper `className` instead of targeting chat internals.

CSS Modules, CSS-in-JS, Tailwind migration, and Shadow DOM remain out of scope for this step.
