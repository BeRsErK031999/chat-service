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
      'Realtime reaches connected state and recovers after reconnect',
      'Send/retry clears optimistic pending state without duplicate messages',
      'Notification routing opens the expected room',
      'Close/reopen restores relevant chat state',
    ],
  },
  {
    title: 'Security grep checklist',
    items: [
      'No VITE_CHAT_INTERNAL_AUTH_SECRET in env, docs examples, renderer source, or build output',
      'No accessToken, bearer token, Authorization header, cookie, message body, or notification body in logs',
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
