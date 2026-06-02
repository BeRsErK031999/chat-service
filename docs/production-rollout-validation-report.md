# Production Rollout Validation Report

Date: 2026-06-02

## Environment

Milestone: controlled internal beta rollout validation.

Scope:

- `chat-service` commit: `2449217138c6b1ae9381d6e867b903127656bcbc`
- `time-tracker-desktop` commit: `d8ffd60e45c533b2ccad9153f0c6408e08fab496`
- Branch: `develop` in both repositories
- Rollout posture: `CHAT_ENABLED=false` by default, with beta access controlled by Electron main through
  `CHAT_BETA_USER_IDS` and `CHAT_BETA_EMAILS`

This report records readiness evidence for allowing a limited internal beta cohort to use chat. It is not a development
milestone and does not add new ActivityPanel behavior, workflow features, shortcuts, endpoints, diagnostics surfaces, or
realtime mechanisms.

## Ordinary User Result

Result: ready to validate in production desktop smoke.

Expected ordinary-user posture with `CHAT_ENABLED=false` and no allowlist match:

- no desktop chat button;
- hidden shortcut does not open chat;
- chat overlay does not mount;
- ActivityPanel does not mount;
- no desktop EventSource starts for that user;
- no chat API requests are emitted by the desktop entry point;
- diagnostics panel is not exposed.

Evidence:

- `docs/chat-controlled-rollout.md` defines `CHAT_ENABLED=false` as the default production posture and requires beta
  allowlist checks in Electron main.
- `yarn chat:rollout-checklist` confirms the disabled desktop entry point means no desktop `ChatWidget` mount and no
  EventSource for that user.
- `time-tracker-desktop` `yarn check:desktop-chat-env` confirms renderer-visible rollout flags are absent and
  `CHAT_ENABLED` defaults to disabled when unset.

Manual beta gate still required: run one real ordinary desktop session with a non-allowlisted employee and record the
button, shortcut, overlay, network, and diagnostics observations.

## Beta User Result

Result: ready for limited internal beta smoke, with manual user-session evidence still required.

Expected beta-user posture with `CHAT_ENABLED=false` and an allowlist match:

- hidden desktop shortcut can open the overlay only after Electron main rollout access passes;
- rooms load through existing bearer auth;
- ActivityPanel, navigation, unread cues, keyboard workflow, continuity restore, and sanitized diagnostics remain active;
- one visible overlay owns one active EventSource.

Evidence:

- `yarn chat:rollout-checklist` preserves the beta smoke contract, including the hidden shortcut, diagnostics, and
  `activeEventSourceCount=1`.
- `yarn chat:smoke-checklist` preserves desktop visual smoke expectations for rooms, ActivityPanel, shortcut help,
  navigation restore, message highlight restore, malformed continuity storage, send/retry, and notification routing.
- `time-tracker-desktop` `yarn type-check` and `yarn build` passed against the current desktop integration.

Manual beta gate still required: run 2-5 allowlisted internal users through the real desktop overlay and record observed
room load, unread/activity behavior, navigation restore, diagnostics counters, and any feedback.

## Long Session Result

Result: checklist-ready; live 30-60 minute session evidence still required for this rollout candidate.

Expected long-session signals:

- one visible widget reports `activeEventSourceCount=1`;
- `leakMarkers=0`;
- `duplicate_event_count=0` for normal smoke traffic;
- room switching, activity navigation, recent task reopen, close/reopen, and continuity restore do not create EventSource
  accumulation;
- reconnect does not storm after recovery;
- storage and diagnostics do not expose tokens or secret-like values.

Evidence:

- `yarn chat:realtime-stress-checklist` prints the long-session room switching, ActivityPanel, overlay lifecycle,
  reconnect, interaction hint, and safe diagnostic review flow.
- Automated runtime guardrails passed in `yarn test`, including EventSource lifecycle, diagnostics safety, activity
  traversal, and navigation continuity coverage.
- Historical readiness evidence exists in `docs/operational-readiness.md` for previous staging routing, desktop
  diagnostics, and activity continuity baselines.

Manual beta gate still required: keep a beta desktop overlay open for 30-60 minutes and record counters before approving
broader rollout.

## Security Result

Result: pass for local automated and source-level readiness; live bearer smoke still requires staging secrets and real
sessions.

Confirmed by validation:

- `chat-service` rejects disabled dev-user-id paths in automated auth/API/SSE tests.
- `chat-service` bearer auth, SSE content type, CORS guardrails, and token diagnostics coverage are included in tests and
  readiness scripts.
- `time-tracker-desktop` env guardrails confirm:
  - `VITE_CHAT_INTERNAL_AUTH_SECRET` is absent;
  - `VITE_CHAT_ENABLED` is absent;
  - renderer-visible bearer identity env values are absent;
  - secret boundary and controlled rollout docs are present.

Known shell warnings:

- `CHAT_INTERNAL_AUTH_SECRET` was not set in the local shell.
- `CORS_ALLOWED_ORIGINS` was not set in the local shell.
- `CHAT_IDENTITY_API_BASE_URL` was not set in the desktop shell and would rely on documented fallback URLs.

These warnings are acceptable for local readiness commands but must be configured explicitly for staging or production
bearer smoke.

## Realtime Result

Result: pass for automated runtime guardrails and checklist readiness.

Confirmed by validation:

- `test/events.test.ts` passed.
- `test/chatUiRuntimeGuardrails.test.ts` passed.
- `test/messageIdempotency.test.ts` passed.
- `yarn chat:realtime-stress-checklist` preserved the expected live counters:
  `activeEventSourceCount_max=1`, `leakMarkers=0`, `duplicate_event_count=0`,
  `duplicate_connection_prevented_count=0`, and `reconnect_failed_count=0`.

Live SSE smoke still needs real bearer tokens and must record only safe pass/fail evidence, not token values or raw
`accessToken` URLs.

## Collected Feedback

No new beta-user feedback was collected during this repository validation pass.

Feedback collection for the first internal beta cohort should record:

- inconvenient workflows;
- unclear UI states;
- real scenarios used;
- bugs;
- reconnect problems;
- unread/activity problems.

Classify each item as `Critical`, `Major`, or `Minor` before deciding fixes. Do not fix feedback items during the
collection step unless they block safe rollout.

## Critical Issues

No critical repository validation issues were found.

Open rollout risks:

- ordinary-user and beta-user desktop smoke still need real employee sessions;
- long-session evidence still needs a 30-60 minute live run;
- staging/prod secrets and CORS origins were not present in the local validation shell;
- the requested `yarn chat` command is not defined in `chat-service`; the available chat checklist commands were run
  instead.

## Recommended Next Actions

1. Configure staging or production beta environment with `CHAT_ENABLED=false` and only the intended internal beta users in
   `CHAT_BETA_USER_IDS` or `CHAT_BETA_EMAILS`.
2. Run ordinary-user validation with a non-allowlisted employee and record button, shortcut, overlay, network, and
   diagnostics results.
3. Run beta-user validation for 2-5 allowlisted employees and record ActivityPanel, navigation, unread, diagnostics, and
   realtime counters.
4. Run one 30-60 minute long-session beta smoke and record `activeEventSourceCount`, `leakMarkers`,
   `duplicate_event_count`, reconnect behavior, and storage/diagnostic sanitization.
5. Collect feedback as `Critical`, `Major`, or `Minor` before starting fixes.
6. Proceed to limited internal beta rollout only if real-session evidence matches the automated readiness baseline.

## Verification

`chat-service`:

- `yarn type-check` passed.
- `yarn lint` passed.
- `yarn test` passed: 14 test files, 90 tests.
- `yarn build` passed.
- `yarn check:chat-env` passed with 0 failures and 2 local-shell warnings.
- `yarn chat:smoke-checklist` passed.
- `yarn chat:realtime-stress-checklist` passed.
- `yarn chat:rollout-checklist` passed.
- `git diff --check` passed.

`time-tracker-desktop`:

- `yarn type-check` passed.
- `yarn build` passed.
- `yarn check:desktop-chat-env` passed with 0 failures and 2 local-shell warnings.
- `git diff --check` passed.

Unavailable commands:

- `chat-service` has no `yarn chat` script.
- `time-tracker-desktop` has no `yarn check` script.
