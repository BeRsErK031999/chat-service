# Migration from Rocket.Chat Prototype

## Purpose

This document records how development moves from `rocket-chat-notification-service` to `chat-service`.

`chat-service` is the new main backend for the custom task-centric mini-chat. `rocket-chat-notification-service`
remains a temporary prototype for checking Rocket.Chat-based notification delivery and should not receive further
development as the final chat core.

## What Stays in rocket-chat-notification-service

- Rocket.Chat-specific client integration.
- Temporary channel delivery logic.
- Prototype smoke scripts for Rocket.Chat delivery checks.
- Existing validation of the NATS-to-notification-delivery path.
- Historical implementation context for operational learnings.

## What Moves to chat-service

- The final ownership of rooms, memberships, messages, read states, and notifications.
- Task-centric room model and task-room links.
- Event contract discipline and versioning approach.
- Routing concepts for deciding which users and rooms receive task events.
- Template concepts for converting task events into user-facing notification text.
- Delivery reliability requirements, including retries, idempotency, and failure visibility.
- Observability requirements for health, readiness, logging, metrics, and later tracing.

## What Does Not Move

- Rocket.Chat channel model as a persistence model.
- Rocket.Chat API client code.
- Rocket.Chat user/channel synchronization behavior.
- Docker setup from the prototype.
- Prototype-only scripts that exist only to operate a Rocket.Chat sandbox.
- Any secrets, local `.env` files, generated `dist`, `node_modules`, or coverage artifacts.

## Validated Prototype Decisions

- Task events need stable contracts and explicit validation at service boundaries.
- Notification routing must be isolated from transport details.
- Templates should be deterministic and testable.
- Delivery attempts need idempotency keys.
- Health/readiness endpoints are useful from the first implementation phase.
- Structured logging is required for troubleshooting delivery behavior.

## Decisions to Revisit

- Rocket.Chat channels are replaced by first-party `rooms`.
- Rocket.Chat messages are replaced by first-party `messages` and `notifications`.
- Rocket.Chat delivery status is not enough for the final product; `chat-service` needs its own delivery and read
  state.
- NATS consumers should be added later behind explicit event contracts, not copied from the prototype wholesale.
- Desktop popup delivery needs a client/runtime contract beyond backend notification creation.
- Permission checks must be based on TTS/standalone membership projections, not Rocket.Chat membership.

## Target Direction

The final backend writes task events and user messages into `chat-service` persistence first. Realtime delivery,
desktop notifications, and future integrations should read from or react to that first-party domain model instead
of treating Rocket.Chat as the source of truth.
