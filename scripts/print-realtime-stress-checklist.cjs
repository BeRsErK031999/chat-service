const sections = [
  {
    title: 'Setup',
    items: [
      'Enable host-side diagnostics only when needed, for example VITE_CHAT_DIAGNOSTICS=true in desktop.',
      'Keep one visible ChatWidget instance open and avoid running multiple smoke clients as the same user unless that is intentional.',
      'Use bearer tokens only through the normal trusted host path; do not paste tokens into logs or screenshots.',
    ],
  },
  {
    title: 'Room switching stress',
    items: [
      'Switch rooms at least 25 times using click, ActivityPanel items, search, keyboard traversal, next unread, related, recent task, and back actions.',
      'Expected: room_switched count increases, activeEventSourceCount remains 1, and realtime status does not flicker during ordinary room switches.',
      'Unhealthy: EventSource reconnects on every room switch, duplicate listeners grow, or reconnect logs spam without a network change.',
    ],
  },
  {
    title: 'Activity inbox stress',
    items: [
      'Confirm ActivityPanel renders both Needs attention and Recent activity; attention-heavy data must not hide Recent activity from the smoke path.',
      'Click Needs attention and Recent activity items repeatedly, including entries with messageId and taskId targets.',
      'Expected: selected room and message highlight follow the normalized/canonical target, Back returns to the previous discussion, and ChatWidget stays mounted.',
      'Expected: after restore, remembered targets do not pin requestedRoomId; ordinary room clicks, Back, Recent task, and activity clicks still work.',
      'Unhealthy: activity clicks recreate the EventSource, clear selected room continuity unexpectedly, pin navigation to a restored room, or emit token/accessToken values in diagnostics.',
    ],
  },
  {
    title: 'Overlay lifecycle stress',
    items: [
      'Close and reopen the desktop overlay at least 10 times.',
      'Expected: cleanup count increases on close, a new connect_start/connected pair appears on reopen, activeEventSourceCount returns to 1, and canonical room/task/message continuity restores.',
      'Expected: messageId highlight restores when the message is loaded, and malformed sessionStorage values fail/skip restore without crash.',
      'Unhealthy: activeEventSourceCount grows above 1 for one widget, unread count doubles, last selected room is lost, or restored target pins later navigation.',
    ],
  },
  {
    title: 'Reconnect cycle',
    items: [
      'Temporarily interrupt and restore network or restart only the chat-service app container during a smoke window.',
      'Expected: disconnected then connected, reconnect attempt/success counters move, HTTP refresh recovers rooms/messages/notifications.',
      'Unhealthy: reconnect failures grow after recovery, polling hides a permanently disconnected stream, or duplicate messages/notifications appear.',
    ],
  },
  {
    title: 'Interaction hint side-effect check',
    items: [
      'Switch active rooms and, when the host wires onInteractionHintsChange, observe local viewing or active_in_room hints.',
      'Expected: repeated same-room hints are debounced, stale hints expire after the documented timeout, and activeEventSourceCount remains 1.',
      'Unhealthy: hints create backend requests, notifications, unread changes, room.typing/room.activity fanout, or EventSource reconnect churn.',
    ],
  },
  {
    title: 'Safe diagnostic review',
    items: [
      'Allowed fields: kind, status, timestamp, eventName, selectedRoomId, lifecycle counters, timestamps, roomCount, and unreadCount.',
      'Do not log bearer tokens, accessToken query strings, Authorization headers, cookies, secrets, SSE URLs, message bodies, notification bodies, or display names.',
      'Confirm sessionStorage contains no token-like values; continuity storage may contain only the canonical chat-nav:v1 target and timestamp.',
      'Expected counters during normal restore/reopen: activeEventSourceCount_max=1, leakMarkers=0, duplicate_event_count=0, duplicate_connection_prevented_count=0, reconnect_failed_count=0.',
      'Record only pass/fail, counts, timestamps, and known limitations in docs evidence.',
    ],
  },
];

console.log('chat realtime long-session stress checklist');
console.log('No requests are executed and no secrets are required.\n');

for (const section of sections) {
  console.log(section.title);
  for (const item of section.items) {
    console.log(`- ${item}`);
  }
  console.log('');
}
