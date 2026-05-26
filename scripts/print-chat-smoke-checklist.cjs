const sections = [
  {
    title: 'Pre-deploy checks',
    items: [
      'git status --short --branch shows the intended branch and no unrelated changes',
      'yarn prisma:generate, yarn db:validate, yarn type-check, yarn lint, yarn test, and yarn build pass',
      'git diff --check passes',
      'CHAT_INTERNAL_AUTH_SECRET exists only in server/trusted host env and is not VITE-prefixed',
      'CHAT_ALLOW_DEV_USER_ID is false for staging/prod',
      'CORS allowed origins are explicit and include the desktop dev origin when needed',
      'Prisma migrations are reviewed separately from image deploy when present',
    ],
  },
  {
    title: 'Post-deploy API/SSE checks',
    items: [
      'GET /chat/api/health returns 200',
      'GET /chat/api/rooms with a short-lived bearer token returns 200',
      'GET /chat/api/rooms with only x-user-id returns 401 when dev-user-id is disabled',
      '/chat/api/events?accessToken=<token> returns text/event-stream',
      'SSE observes message.created, notification.created, room.read, and presence.changed during two-user smoke',
      'Private Network Access preflight echoes the exact allowed origin and allow-private-network header',
      'Idempotency-Key retry returns the same persisted message id',
    ],
  },
  {
    title: 'Native desktop visual smoke checklist',
    items: [
      'Electron main receives CHAT_INTERNAL_AUTH_SECRET; renderer does not',
      'Native overlay opens from the titlebar launcher',
      'Rooms render with task grouping, unread cues, and notification cues',
      'ActivityPanel renders Needs attention and Recent activity from existing notification and room primitives',
      'ActivityPanel stays visible but compact; Needs attention does not completely crowd out Recent activity',
      'Message list remains usable at desktop overlay width while long task, room, and message titles truncate safely',
      'Clicking a recent activity item navigates through the normalized/canonical target to the expected room without remounting ChatWidget',
      'Clicking an attention activity item opens the expected room/message/task and preserves the message highlight when messageId is present',
      'Close/reopen restores the canonical activity/task/message target from local continuity storage',
      'Remembered target is initial-only and does not pin requestedRoomId after restore; Back, Recent task, room clicks, and activity clicks still work',
      'Malformed sessionStorage continuity values skip or fail restore without crashing',
      'Activity navigation keeps activeEventSourceCount at 1 and does not add leakMarkers, duplicate listeners, or duplicate events',
      'Realtime reaches connected state and recovers after reconnect',
      'Send/retry clears optimistic pending state without duplicate messages',
      'Notification routing opens the expected room',
      'Close/reopen restores relevant chat state',
      'Interaction hints emit locally through onInteractionHintsChange without notification, unread, backend request, or EventSource side effects',
    ],
  },
  {
    title: 'Security grep checklist',
    items: [
      'No VITE_CHAT_INTERNAL_AUTH_SECRET in env, docs examples, renderer source, or build output',
      'No accessToken, bearer token, Authorization header, cookie, message body, or notification body in logs',
      'No token-like values in sessionStorage; continuity stores only canonical target string plus timestamp',
      'No renderer identity fallback for production-style auth',
      'No wildcard CORS for credentialed chat API/SSE',
      'No webSecurity: false or TLS verification bypass',
    ],
  },
  {
    title: 'Known limitations',
    items: [
      'This helper prints a checklist only; it does not call staging, open Electron, or validate real secrets',
      'Browser playground smoke is not a substitute for native desktop visual smoke',
      'Bearer tokens used during manual smoke are sensitive and should stay out of logs, screenshots, and docs evidence',
      'Deploy and Prisma migration execution remain separate commands',
    ],
  },
];

console.log('chat-service smoke readiness checklist');
console.log('No requests are executed and no secrets are required.\n');

for (const section of sections) {
  console.log(section.title);
  for (const item of section.items) {
    console.log(`- ${item}`);
  }
  console.log('');
}
