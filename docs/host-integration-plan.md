# Host Integration Plan

## Auth Flow

Host login/session remains the source of truth. The host maps its logged-in user to a chat user id, creates a short-lived
chat internal token, and passes that token to `ChatWidget`.

```text
host login/session -> signed chat token -> chat-service bearer auth -> room membership checks
```

This is not OAuth, SSO, refresh tokens, RBAC redesign, or a separate auth service.

## Token Generation

Token format is HS256 JWT-style:

```json
{
  "userId": "11111111-1111-4111-8111-111111111111",
  "displayName": "Artem",
  "issuedAt": 1779120000,
  "expiresAt": 1779120900,
  "source": "desktop"
}
```

Hosts sign with the same `CHAT_INTERNAL_AUTH_SECRET` configured in `chat-service`. Use a short TTL such as 15 minutes.
The desktop spike refreshes the token before expiry.

## Backend Setup

```env
CHAT_INTERNAL_AUTH_SECRET=<shared random secret, 32+ chars>
CHAT_ALLOW_DEV_USER_ID=false
```

Production requests must send:

```text
Authorization: Bearer <chat-internal-token>
```

Development can keep:

```env
CHAT_ALLOW_DEV_USER_ID=true
```

When enabled, `x-user-id` and `/events?userId=` continue to work for local smoke testing.

## SSE Strategy

Native browser `EventSource` cannot send `Authorization`. Host/browser embeds use:

```text
/events?accessToken=<short-lived-chat-token>
```

The backend validates the same signature and expiration. Query-token risk: reverse proxies and access logs can capture
the token. Keep TTL short and treat logs as sensitive.

## Desktop Status

`time-tracker-desktop` now generates a chat bearer token when `VITE_CHAT_INTERNAL_AUTH_SECRET` is configured and passes
`auth.strategy: "bearer"` to `ChatWidget`. If the secret is absent, the existing dev-user-id path remains for local
workflow only.

## Next Phase

- Move token signing out of renderer-visible env for packaged production.
- Define stable host-user to chat-user mapping instead of env overrides.
- Add operational guidance for secret rotation and proxy log redaction.
