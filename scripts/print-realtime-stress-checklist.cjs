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
      'Switch rooms at least 25 times using click, search, keyboard traversal, next unread, related, recent task, and back actions.',
      'Expected: room_switched count increases, activeEventSourceCount remains 1, and realtime status does not flicker during ordinary room switches.',
      'Unhealthy: EventSource reconnects on every room switch, duplicate listeners grow, or reconnect logs spam without a network change.',
    ],
  },
  {
    title: 'Overlay lifecycle stress',
    items: [
      'Close and reopen the desktop overlay at least 10 times.',
      'Expected: cleanup count increases on close, a new connect_start/connected pair appears on reopen, and activeEventSourceCount returns to 1.',
      'Unhealthy: activeEventSourceCount grows above 1 for one widget, unread count doubles, or the last selected room is lost.',
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
    title: 'Safe diagnostic review',
    items: [
      'Allowed fields: kind, status, timestamp, eventName, selectedRoomId, lifecycle counters, timestamps, roomCount, and unreadCount.',
      'Do not log bearer tokens, accessToken query strings, Authorization headers, cookies, secrets, SSE URLs, message bodies, notification bodies, or display names.',
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
