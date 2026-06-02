# Chat Beta Testing Guide

This guide covers the temporary desktop beta flow that uses real `chat-service` rooms and messages with a mock identity
provider in Electron main. It does not connect to the monolith and does not replace the future users-service integration.

## Prepare Beta Data

Run migrations first, then seed the temporary rooms:

```powershell
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:55432/chat_service?schema=public"
$env:CHAT_BETA_SEED_TARGET="staging"
yarn chat:seed-beta-rooms
```

Use `yarn chat:seed-beta-rooms --dry-run` to print the planned users and rooms without writing to the database.

Seeded beta tester identity:

```text
User.id: 44444444-4444-4444-8444-444444444444
externalUserId: beta-tester-1
email: beta.tester@example.local
displayName: Beta Tester
```

The bearer token `userId` must be the UUID above because `chat-service` permissions are keyed by `User.id`.

## Build And Run

Use the desktop repo build commands documented there for the beta package. The chat service side provides
`.env.beta-chat.example` as the safe environment template for the desktop beta chat flags and seeded user values.

Backend artifact after `yarn build`:

```text
dist/server.js
dist/scripts/seed-beta-rooms.js
```

If an installer/package command is absent in the desktop repo, use the built desktop artifacts from that repo and include
the commit hash in the feedback template.

## Open Chat

When `CHAT_ENABLED=true`, the chat entry point is visible for authenticated desktop users.

When `CHAT_ENABLED=false`, only allowlisted beta users can open chat through the hidden desktop shortcut:

```text
Ctrl+Shift+Alt+C
```

The hidden shortcut must still pass the same Electron main rollout gate. It must not mount chat or start SSE for an
ordinary user who is not allowlisted.

## Tester Scenarios

1. Open chat.
2. Check the room list.
3. Send a message.
4. Switch rooms.
5. Check unread/activity behavior.
6. Check ActivityPanel.
7. Check keyboard navigation.
8. Close and reopen the overlay.
9. Leave the app open for 30 minutes and confirm realtime stays connected.
10. Report bugs with screenshots and logs.

## Diagnostics

Diagnostics are optional and controlled by `VITE_CHAT_DIAGNOSTICS=true`. Do not include bearer tokens, authorization
headers, or secrets in screenshots or logs.

## Bug Reports

Use `docs/chat-beta-feedback-template.md`. Include:

- build version or commit;
- short reproduction steps;
- expected and actual behavior;
- screenshots or sanitized logs;
- severity.

## Out Of Scope

Do not test file upload, reactions, typing indicators, message edit/delete, WebSocket behavior, Redis/NATS fanout, or
production users-service identity. This beta milestone checks the existing chat UI/runtime with real service data and a
temporary mock identity source.
