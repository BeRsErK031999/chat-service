# Chat Controlled Rollout

The chat runtime remains part of the production build while desktop exposure is limited to an internal beta cohort.
This is a rollout gate, not an auth boundary and not a product fork.

## Contract

- `chat-service` keeps bearer auth, SSE, ActivityPanel data flow, navigation contracts, diagnostics, and room permission
  checks unchanged.
- `time-tracker-desktop` controls whether the desktop chat entry point can mount `DesktopChatWidget`.
- The desktop gate must be evaluated in Electron main. Renderer code must not receive `CHAT_INTERNAL_AUTH_SECRET`,
  desktop session tokens, or renderer-controlled chat identity.
- Hidden entry points are allowed only after the same main-process rollout access check passes. They do not replace
  bearer auth or chat-service permissions.

## Desktop Flags

Use these main-process desktop env values:

```env
CHAT_ENABLED=false
CHAT_BETA_USER_IDS=
CHAT_BETA_EMAILS=
CHAT_IDENTITY_MODE=mock
CHAT_MOCK_USER_ID=
CHAT_MOCK_USER_EMAIL=
CHAT_MOCK_USER_DISPLAY_NAME=
```

`CHAT_ENABLED=false` is the default production posture. It hides chat from ordinary desktop users. Internal beta users can
still be allowed by `CHAT_BETA_USER_IDS` or `CHAT_BETA_EMAILS`, which are matched against the trusted desktop
`/employees/me/` identity in Electron main.

Set `CHAT_ENABLED=true` only when the desktop chat entry point should be available to all authenticated desktop users.

`CHAT_IDENTITY_MODE=mock` is only for desktop beta/dev/test in Electron main. Production default must remain the
current production-style identity flow. If mock mode is enabled, Electron main must fail closed unless the mock user ID,
email, and display name are configured. Renderer code must not receive the signing secret or a raw identity payload.

For seeded `chat-service` beta rooms, use the UUID user ID printed by `yarn chat:seed-beta-rooms`; the friendly mock ID
is stored on the user as `externalUserId`.

## Rollback

To disable the rollout without removing chat from the production build:

1. Set `CHAT_ENABLED=false`.
2. Remove the user from `CHAT_BETA_USER_IDS` and `CHAT_BETA_EMAILS`.
3. Restart the desktop app so Electron main reloads the environment.
4. Keep `chat-service` deployed with bearer auth and SSE intact.

## Verification

Run the service-side checklist:

```powershell
yarn chat:rollout-checklist
```

Then smoke the desktop app:

- ordinary user with `CHAT_ENABLED=false` sees no chat button and cannot open the hidden overlay;
- allowlisted beta user with `CHAT_ENABLED=false` opens chat through the hidden desktop shortcut;
- beta user keeps `activeEventSourceCount=1` for one open overlay;
- ActivityPanel, navigation restore, diagnostics, and bearer auth invariants match `docs/chat-runtime-readiness-matrix.md`;
- logs and diagnostics contain no bearer token, `accessToken`, Authorization header, desktop token, or secret.
