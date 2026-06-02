# Chat Beta Launch Smoke

Date: 2026-06-02

## Scope

Final beta launch smoke for the `chat-service` side of the desktop beta package. This confirms that seeded beta data,
bearer auth, SSE auth, and rollout guardrail commands are ready for a 2-5 person tester rollout.

## Environment

- `NODE_ENV` was not set to `production` for seed commands.
- `CHAT_INTERNAL_AUTH_SECRET` was loaded from ignored local environment and was not printed.
- `CHAT_ALLOW_DEV_USER_ID=false`.
- `CORS_ALLOWED_ORIGINS` was set to the desktop renderer origin for smoke.
- Local PostgreSQL was started with the existing `docker-compose.postgres.yml`.

## Seed Result

`yarn chat:seed-beta-rooms --dry-run` passed.

The first real seed attempt exposed an idempotency bug when an existing dev `Direct Chat` room already occupied
`roomId + sequence`. The seed now keys beta rooms with explicit `createdByEventId` markers so it does not reuse unrelated
rooms with the same display name.

After the fix, `yarn chat:seed-beta-rooms` was run twice successfully. Both runs returned the same seeded beta room IDs,
confirming repeatability without duplicate messages.

Seeded beta tester:

```text
User.id: 44444444-4444-4444-8444-444444444444
externalUserId: beta-tester-1
email: beta.tester@example.local
displayName: Beta Tester
```

## API Security Smoke

The built server was started locally from `dist/src/server.js` on port `4100`.

Safe results:

```text
health=200
bearer_rooms_status=200
seeded_rooms_missing=0
x_user_id_rooms_status=401
events_user_id_status=401
sse_status=200
sse_content_type=text/event-stream
```

The bearer token was captured in-memory only and was not printed. Local smoke logs were scanned for sensitive markers;
no `accessToken`, `Bearer`, `Authorization`, `CHAT_INTERNAL_AUTH_SECRET`, or `secret` markers were found.

## Verification

Passed:

- `yarn type-check`
- `yarn lint`
- `yarn test`
- `yarn build`
- `yarn check:chat-env`
- `yarn chat:seed-beta-rooms --dry-run`
- `yarn chat:seed-beta-rooms` twice
- `yarn chat:smoke-checklist`
- `yarn chat:realtime-stress-checklist`
- `yarn chat:rollout-checklist`
- `git diff --check`

## Remaining Manual Checks

Installed desktop overlay smoke still needs to be performed from the packaged app against the same beta backend:

- hidden shortcut opens only for the allowlisted mock beta user;
- all five seeded rooms and seeded messages are visible;
- ActivityPanel, keyboard navigation, shortcut help, workflow actions, and continuity restore work;
- diagnostics show `activeEventSourceCount=1`, `leakMarkers=0`, `duplicate_event_count=0`,
  `duplicate_connection_prevention_count=0`, and no normal-flow reconnect failures.
