# Chat Runtime Readiness Matrix

This audit records the production-readiness freeze baseline for the shared chat runtime used by `chat-service` and
`time-tracker-desktop`. It is intentionally documentation-only: no new user features, transports, workflow surfaces, or
backend APIs are introduced by this readiness record.

## Audit Conclusion

Yes. A new developer opening the chat runtime in six months can identify the critical runtime, security, navigation,
continuity, diagnostics, and operational invariants from this document, then follow each row to the supporting docs,
tests, assertions, and observable diagnostics. Remaining gaps are intentionally classified below where protection is
manual, smoke-based, or environment-dependent rather than automated.

## Readiness Matrix

| Invariant | Docs | Tests | Assertions | Diagnostics |
| --------- | ---- | ----- | ---------- | ----------- |
| Production auth is bearer-only; dev-user-id is local/dev only when explicitly enabled. | `docs/server-deploy.md`, `docs/operational-readiness.md`, `docs/manual-chat-testing.md` | `test/auth.test.ts`, `test/events.test.ts`, `test/httpApi.test.ts`, `test/integration/smoke.integration.test.ts` | Auth middleware rejects missing/invalid bearer auth and disabled dev-user-id paths. | Smoke checklist verifies bearer `/rooms`, `x-user-id` rejection, and bearer SSE. |
| Electron main is the trusted signing boundary; renderer does not supply bearer identity. | `docs/developer-onboarding.md`, desktop `docs/chat-integration.md`, desktop `docs/production-auth-hardening-plan.md` | Covered in desktop build/type verification and staging smoke records. | Desktop `chat:getAuthToken` rejects renderer payloads; preload exposes no identity payload. | Desktop env helper and smoke logs verify main-only secret boundary. |
| Renderer has no chat signing secrets or renderer bearer identity overrides. | `docs/server-deploy.md`, `docs/operational-readiness.md`, desktop `docs/chat-integration.md` | `test/chatUiRuntimeGuardrails.test.ts`; desktop `yarn check:desktop-chat-env` | `assertNoTokenDiagnostics()` rejects secret-like diagnostics. | Dev diagnostics and desktop renderer logs are scanned for token/secret markers during smoke. |
| Diagnostics stay sanitized: no tokens, URLs, headers, cookies, bodies, display names, or secrets. | `docs/operational-readiness.md`, `docs/manual-chat-testing.md`, `docs/chat-ui-embedding.md` | `test/chatUiRuntimeGuardrails.test.ts` | `assertNoTokenDiagnostics()`, `assertRuntimeDiagnosticsSafe()` | `DevRuntimeDiagnosticsPanel` exposes sanitized counters and assertion PASS/FAIL only. |
| CORS origins are explicit; no wildcard CORS for chat API/SSE. | `docs/server-deploy.md`, `docs/operational-readiness.md`, `docs/manual-chat-testing.md` | `test/cors.test.ts`, `scripts/check-chat-env.cjs` | Env helper fails wildcard or missing allowed origins. | Smoke checklist includes PNA/CORS preflight evidence. |
| No TLS bypass or Electron `webSecurity` downgrade is allowed. | `docs/server-deploy.md`, desktop `docs/chat-integration.md`, desktop `docs/production-auth-hardening-plan.md` | Protected by review/smoke checklist and desktop build inspection. | No runtime assertion; this remains configuration/review protected. | Smoke checklist scans for TLS bypass and `webSecurity: false`. |
| Realtime transport remains SSE-only; no WebSocket, Redis, or NATS runtime. | `docs/chat-service-design.md`, `docs/operational-readiness.md`, `docs/manual-chat-testing.md` | `test/events.test.ts`, `test/integration/smoke.integration.test.ts` | Event routes/auth enforce SSE event stream behavior. | Diagnostics expose EventSource lifecycle only. |
| One visible widget owns at most one active EventSource (`activeEventSourceCount <= 1`). | `docs/operational-readiness.md`, `docs/manual-chat-testing.md`, desktop `docs/chat-integration.md` | `test/chatUiRuntimeGuardrails.test.ts` | `assertSingleEventSource()`, `assertRuntimeDiagnosticsSafe()` | Diagnostics panel and smoke logs expose `activeEventSourceCount`. |
| Duplicate connection leak markers remain zero (`leakMarkers=0`). | `docs/operational-readiness.md`, `docs/manual-chat-testing.md`, desktop `docs/chat-staging-test.md` | `test/chatUiRuntimeGuardrails.test.ts` | `assertNoLeakMarkers()`, `assertRuntimeDiagnosticsSafe()` | Diagnostics panel exposes `leakMarkers` and duplicate connection prevention count. |
| Duplicate realtime events do not duplicate visible messages, notifications, unread counts, or pending sends. | `docs/operational-readiness.md`, `docs/manual-chat-testing.md`, desktop `docs/chat-integration.md` | `test/chatUiRuntimeGuardrails.test.ts`, `test/messageIdempotency.test.ts`, `test/integration/smoke.integration.test.ts` | Duplicate event ids are ignored before refresh; idempotency rejects conflicting retries. | Diagnostics panel exposes `duplicate_event_count`. |
| Room switching and activity navigation do not recreate EventSource. | `docs/operational-readiness.md`, `docs/manual-chat-testing.md`, desktop `docs/chat-integration.md` | `test/chatUiRuntimeGuardrails.test.ts` | Source guard keeps selected room out of EventSource creation dependencies. | `room_switched` diagnostics and `activeEventSourceCount` reveal churn. |
| Reconnect lifecycle cleans up and refreshes without duplicate listeners. | `docs/operational-readiness.md`, `docs/manual-chat-testing.md`, desktop `docs/chat-staging-test.md` | `test/chatUiRuntimeGuardrails.test.ts`, `test/events.test.ts` | Realtime hook cleanup and duplicate connection prevention counters guard lifecycle. | Diagnostics expose `cleanup`, reconnect counters, and last reconnect reason. |
| Canonical navigation targets use `chat-nav:v1` serialization. | `docs/chat-ui-embedding.md`, `docs/manual-chat-testing.md`, desktop `docs/chat-integration.md` | `test/chatUiNavigation.test.ts`, `test/chatUiNavigationContinuity.test.ts` | Navigation parser/normalizer rejects non-canonical restore storage. | Navigation diagnostics expose remembered/restored target lifecycle. |
| Continuity restore covers room, task, activity, notification, and message highlight targets. | `docs/operational-readiness.md`, `docs/manual-chat-testing.md`, desktop `docs/chat-integration.md` | `test/chatUiNavigationContinuity.test.ts`, `test/chatUiRuntimeGuardrails.test.ts` | Restore helpers return explicit restored/skipped/failed states. | Diagnostics expose `navigation_target_restored`, skipped, failed, and remembered events. |
| Restored targets are initial hints and must not pin later navigation. | `docs/operational-readiness.md`, desktop `docs/chat-integration.md`, desktop `docs/chat-staging-test.md` | `test/chatUiNavigationContinuity.test.ts`, `test/chatUiRuntimeGuardrails.test.ts` | ChatWidget wiring keeps Back, Recent task, and internal selection independent after restore. | Navigation diagnostics plus room switch counters reveal parent-controlled navigation regressions. |
| Back navigation, Recent task reopen, and message highlight restore remain wired. | `docs/operational-readiness.md`, `docs/manual-chat-testing.md`, desktop `docs/chat-integration.md` | `test/chatUiRuntimeGuardrails.test.ts`, `test/chatUiNavigationContinuity.test.ts` | Source guard checks key ChatWidget wiring for these controls. | Navigation diagnostics and smoke checklist cover restore/highlight behavior. |
| Continuity storage contains only canonical target string and timestamp; no token-like values. | `docs/operational-readiness.md`, `docs/manual-chat-testing.md`, desktop `docs/chat-integration.md` | `test/chatUiNavigationContinuity.test.ts` | `assertNoTokenDiagnostics()` is applied to stored continuity payloads in tests. | Smoke checklist requires `sessionStorage` inspection; restore diagnostics are sanitized. |
| Malformed or stale continuity storage fails/skips restore without crashing. | `docs/operational-readiness.md`, `docs/manual-chat-testing.md`, desktop `docs/chat-staging-test.md` | `test/chatUiNavigationContinuity.test.ts` | Restore helper returns `failed` or `skipped` instead of throwing. | Diagnostics expose `navigation_target_restore_failed` or skipped without sensitive fields. |
| ActivityPanel renders Needs attention and Recent activity from existing rooms/notifications only. | `docs/operational-readiness.md`, `docs/manual-chat-testing.md`, desktop `docs/chat-integration.md` | `test/chatUiActivity.test.ts`, `test/chatUiRuntimeGuardrails.test.ts` | Activity derivation remains client-side and does not require backend inbox state. | Diagnostics panel exposes activity item counts/descriptions without content bodies. |
| ActivityPanel keyboard traversal and workflow cycling remain executable and focus-safe. | `docs/manual-chat-testing.md`, desktop `docs/chat-integration.md`, scripts checklist | `test/chatUiRuntimeGuardrails.test.ts` | `activityKeyboard` maps supported keys to bounded actions. | Smoke checklist covers shortcut help, Escape, composer/search focus restoration. |
| Focus restoration keeps search, composer, shortcut help, and activity traversal usable. | `docs/manual-chat-testing.md`, desktop `docs/chat-integration.md` | `test/chatUiInteraction.test.ts`, `test/chatUiRuntimeGuardrails.test.ts` | Focus handlers restore composer/search/help button without trapping focus. | Manual smoke remains the main observable signal for browser focus behavior. |
| Interaction hints stay local, debounced, stale-expiring, and do not create unread/notification/backend/SSE side effects. | `docs/operational-readiness.md`, `docs/manual-chat-testing.md`, desktop `docs/chat-integration.md` | `test/chatUiInteraction.test.ts` | Interaction helpers enforce debounce/stale behavior. | Smoke checklist verifies no EventSource churn or backend fanout from hints. |
| Message retry with the same `Idempotency-Key` returns the same persisted message and does not duplicate. | `docs/operational-readiness.md`, `docs/manual-chat-testing.md`, desktop `docs/chat-integration.md` | `test/messageIdempotency.test.ts`, `test/integration/smoke.integration.test.ts` | Message service rejects reused keys with different bodies. | Smoke checklist records retry behavior; no dedicated diagnostics counter. |
| Dev diagnostics panel is opt-in and hidden unless `VITE_CHAT_DIAGNOSTICS=true`. | `docs/operational-readiness.md`, desktop `docs/chat-staging-test.md` | `test/chatUiRuntimeGuardrails.test.ts` | Source guard verifies diagnostics gate and sanitized panel content. | Panel exposes realtime, navigation, activity, and assertion status when enabled. |
| Operational release gates run validation, env checks, smoke checklist, realtime stress checklist, and diff review. | `docs/operational-readiness.md`, `docs/manual-chat-testing.md` | Command execution during release/audit. | Checklist helpers fail unsafe env/doc guardrails where automated. | Checklist output is the observable operational surface. |

## Gap Analysis

No runtime feature gap was found during the freeze audit. The real gap was discoverability: critical invariants were
documented across several runbooks and staging logs, but not grouped into a single matrix that mapped each invariant to
its docs, tests, assertions, and diagnostics.

Gap classifications after this document:

- A. Documented but not tested: TLS bypass and Electron `webSecurity` remain protected by review/checklist rather than
  automated tests because they are host packaging/configuration invariants.
- B. Tested but not observable: message idempotency has automated API coverage and smoke evidence, but no runtime
  diagnostics counter. This is acceptable for now because it is a backend persistence/API invariant, not a live UI
  lifecycle counter.
- C. Observable but not documented: closed by this matrix for realtime, navigation, activity, storage, and diagnostics
  counters.
- D. Asserted but not tested: no current examples found; all exported shared runtime assertions have regression tests.
- E. Protected only by smoke/manual validation: TLS bypass, Electron `webSecurity`, visual ActivityPanel visibility,
  and fine-grained focus restoration remain manual/smoke protected.

## Historical Bug Audit

| Historical issue | Documented | Tested | Asserted | Observable |
| ---------------- | ---------- | ------ | -------- | ---------- |
| EventSource churn during room switching | `docs/operational-readiness.md`, `docs/manual-chat-testing.md`, desktop `docs/chat-staging-test.md` | `test/chatUiRuntimeGuardrails.test.ts` checks dependency shape | `assertSingleEventSource()`, `assertNoLeakMarkers()` | `activeEventSourceCount`, `room_switched`, `cleanup`, `leakMarkers` |
| Restore pinning after continuity restore | `docs/operational-readiness.md`, desktop `docs/chat-integration.md` | `test/chatUiNavigationContinuity.test.ts`, `test/chatUiRuntimeGuardrails.test.ts` | Source wiring guard for initial-only restore controls | Navigation restore diagnostics and room switching smoke |
| ActivityPanel hidden or Recent activity crowded out | `docs/operational-readiness.md`, `docs/manual-chat-testing.md`, desktop `docs/chat-integration.md` | Activity derivation/keyboard tests; visual layout remains smoke-only | No runtime assertion for layout visibility | Manual desktop smoke and Activity diagnostics item counts |
| Parent-controlled navigation overriding internal clicks | `docs/operational-readiness.md`, desktop `docs/chat-integration.md` | `test/chatUiRuntimeGuardrails.test.ts` | Source wiring guard around `navigationTarget`, Back, Recent task | Navigation diagnostics and room switch smoke |
| Duplicate listeners or duplicate realtime events | `docs/operational-readiness.md`, `docs/manual-chat-testing.md` | `test/chatUiRuntimeGuardrails.test.ts`, integration smoke | Duplicate id guard, `assertSingleEventSource()`, `assertNoLeakMarkers()` | `duplicate_event_count`, cleanup/reconnect counters |
| Token leakage through diagnostics/storage/logs | `docs/operational-readiness.md`, `docs/manual-chat-testing.md`, desktop auth docs | `test/chatUiRuntimeGuardrails.test.ts`, `test/chatUiNavigationContinuity.test.ts` | `assertNoTokenDiagnostics()` | Diagnostics panel, env helpers, smoke log scans |
| Malformed continuity restore crash | `docs/operational-readiness.md`, `docs/manual-chat-testing.md` | `test/chatUiNavigationContinuity.test.ts` | Restore helper status results | `navigation_target_restore_failed` and skipped diagnostics |
| Desktop renderer identity spoofing | desktop `docs/production-auth-hardening-plan.md`, desktop `docs/chat-integration.md` | Desktop type/build/env helper verification | `chat:getAuthToken` rejects payloads; no renderer secret env | `check:desktop-chat-env` and smoke logs |

## Readiness Report

### Security

Current status: production-capable bearer-only baseline with Electron main as the trusted signing boundary. Renderer
identity and renderer secrets are not part of production auth.

Protection level: automated backend auth tests, desktop env guardrails, runtime token diagnostics assertions, and smoke
log review.

Remaining risks: host packaging/configuration regressions such as TLS bypass or `webSecurity` changes are still
primarily review/checklist protected.

### Realtime

Current status: SSE-only realtime with stable EventSource ownership, reconnect lifecycle, duplicate event handling, and
diagnostic counters.

Protection level: automated runtime guardrails, integration smoke, reusable assertions, and diagnostics panel counters.

Remaining risks: long-session network behavior still needs smoke/stress evidence before broad rollout.

### Navigation

Current status: canonical `chat-nav:v1` targets are the shared navigation contract for notification, task, activity,
room, and message-highlight restore.

Protection level: parser/serializer tests, continuity tests, ChatWidget wiring guardrails, and navigation diagnostics.

Remaining risks: deep-link/protocol-handler work is intentionally absent and must be reviewed as a future architecture
change.

### Continuity

Current status: close/reopen restore is initial-only and does not pin later internal navigation.

Protection level: continuity storage tests, malformed/stale restore tests, source wiring checks, and sanitized restore
diagnostics.

Remaining risks: message highlight restore remains best-effort when the message is not in the loaded message window.

### Activity

Current status: ActivityPanel is client-derived from existing rooms and notifications. It does not require backend inbox
state, workflow engine, ranking, or new APIs.

Protection level: activity derivation tests, keyboard traversal tests, smoke checklist, and activity diagnostics.

Remaining risks: visual visibility and Recent activity crowding are still manual smoke checks.

### Keyboard UX

Current status: search, room traversal, workflow cycling, shortcut help, Back/Recent task, and focus restoration are part
of the verified baseline.

Protection level: interaction tests, activity keyboard tests, runtime source guardrails, and manual smoke.

Remaining risks: focus behavior has browser/Electron visual aspects that require manual smoke after layout changes.

### Storage

Current status: continuity storage is limited to canonical target string plus timestamp, with memory fallback and
malformed/stale restore handling.

Protection level: continuity tests and token diagnostics assertions.

Remaining risks: manual sessionStorage inspection remains useful during desktop smoke.

### Diagnostics

Current status: diagnostics are opt-in, sanitized, and expose realtime, navigation, activity, and runtime assertion
status without token-bearing data.

Protection level: diagnostics tests, runtime assertions, panel source guardrails, and smoke log scans.

Remaining risks: diagnostics are a dev/staging surface, not a production analytics platform.

### Observability

Current status: key runtime counters are observable through callbacks, smoke logs, and the dev diagnostics panel.

Protection level: `activeEventSourceCount`, `leakMarkers`, duplicate event count, reconnect counters, navigation restore
events, and activity summaries are visible when diagnostics are enabled.

Remaining risks: backend message idempotency has API/test evidence but no UI diagnostics counter.

### Operational Readiness

Current status: release gates require typecheck, lint, tests, builds, env guardrails, smoke checklist, realtime stress
checklist, and diff review.

Protection level: documented commands and helper scripts.

Remaining risks: live staging reachability, native overlay visuals, and long-session confidence remain environment
dependent and must be recorded as evidence for each rollout.
