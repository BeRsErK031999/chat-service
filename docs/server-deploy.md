# Server Deploy

`chat-service` deploys from the Windows workstation to the Ubuntu Docker host. The host `192.168.22.37` is the
staging/test server used for feature-branch validation before merge to `develop` or release promotion to `main`. There is
no registry, CI deploy, Kubernetes, or public Docker port exposure in this phase.

## Server Layout

- SSH: `admin_devops@192.168.22.37` (staging/test server)
- Project: `/opt/apps/projects/chat-service`
- Uploaded images: `/opt/apps/images`
- Backend: `127.0.0.1:4100`
- Frontend playground: `127.0.0.1:4101`
- PostgreSQL host maintenance port: `127.0.0.1:55432`

Nginx exposes:

- `/chat/` -> frontend playground
- `/chat/api/` -> backend
- `/chat/api/events` -> backend SSE with buffering disabled

## Standard Workflow

Configure SSH key auth first; it is the normal deploy path. Password deploy is only an emergency fallback.

`yarn deploy:server` deploys the current local checkout. Check the selected branch before deploying:

```powershell
git branch --show-current
```

Deploy application containers:

```powershell
yarn deploy:server
```

Apply Prisma migrations only when there are new migrations:

```powershell
yarn deploy:migrate:server
```

Refresh dev test data when needed:

```powershell
yarn dev:seed
```

For server-side seed after deploy:

```bash
cd /opt/apps/projects/chat-service
docker compose run --rm app yarn dev:seed:server
```

`yarn deploy:server` intentionally does not run Prisma migrations. Deploy and migration are separate operations so image
rollout and data-model changes can be reviewed independently. Do not add automatic migration execution to application
deploy.

## SSH Authentication

Key-based SSH is the normal deploy mode. Generate a dedicated deploy key on Windows:

```powershell
ssh-keygen -t ed25519 -C "chat-service-deploy"
```

For example, save it as:

```text
C:\Users\<you>\.ssh\chat-service-deploy
```

For the staging/test server, prefer a dedicated key name:

```powershell
ssh-keygen -t ed25519 -C "chat-service-staging"
```

For example, save it as:

```text
C:\Users\<user>\.ssh\chat-service-staging
```

Add the public key to the server user's authorized keys:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
cat chat-service-deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Verify access from Windows:

```powershell
ssh -i "C:\Users\<you>\.ssh\chat-service-deploy" admin_devops@192.168.22.37
```

Set the key path for deploy commands in the current PowerShell session:

```powershell
$env:CHAT_SERVICE_DEPLOY_SSH_KEY="C:\Users\<you>\.ssh\chat-service-deploy"
```

Or, with the staging key:

```powershell
$env:CHAT_SERVICE_DEPLOY_SSH_KEY="C:\Users\<user>\.ssh\chat-service-staging"
```

Then run:

```powershell
yarn deploy:server
yarn deploy:migrate:server
```

Transport priority is:

1. `CHAT_SERVICE_DEPLOY_SSH_KEY`
2. normal `ssh`/`scp` using the system SSH config or agent
3. `CHAT_SERVICE_DEPLOY_PASSWORD` as emergency fallback only

The scripts run an SSH preflight before Docker build or upload. If SSH is unavailable, they fail with:

```text
SSH access failed. Configure key auth or set CHAT_SERVICE_DEPLOY_PASSWORD for emergency fallback.
```

Do not commit private keys, passwords, or real server `.env` files. Do not write the server password in code or docs.

## Deploy Script

`scripts/deploy-server.ps1` runs from Windows PowerShell. It:

- builds `chat-service:latest` from `Dockerfile`
- builds `chat-service-playground:latest` from `Dockerfile.frontend`
- saves local image tarballs in a temporary directory
- uploads them to:
  - `/opt/apps/images/chat-service.tar`
  - `/opt/apps/images/chat-service-playground.tar`
- uploads `deploy/docker-compose.server.yml` to `/opt/apps/projects/chat-service/docker-compose.yml`
- uploads `deploy/nginx.chat-service.conf` to the project directory and copies it to `/opt/apps/nginx/conf.d/chat-service.conf` when that include directory exists
- does not upload `.env`
- runs `docker load`
- runs `docker compose up -d`
- runs `docker compose ps`
- checks `http://127.0.0.1:4100/health`
- checks `http://127.0.0.1:4101/`

It checks SSH access before building Docker images. With `CHAT_SERVICE_DEPLOY_SSH_KEY`, the script passes `-i <key>` to
`ssh` and `scp`. Without it, the script uses normal `ssh` and `scp`, which can use your SSH config or agent. If both
key-based paths are unavailable and `CHAT_SERVICE_DEPLOY_PASSWORD` is set, it uses the emergency password fallback.

The script requires the server-side `.env` to already exist:

```text
/opt/apps/projects/chat-service/.env
```

Use `deploy/.env.server.example` as a template and never commit real server secrets.

## Staging Smoke Checklist

Before merging a feature branch to `develop`, verify the feature on the staging/test server:

```powershell
yarn type-check
yarn lint
yarn test
yarn build
yarn deploy:server
```

If the branch includes new Prisma migrations:

```powershell
yarn deploy:migrate:server
```

Use server-side seed only when dev smoke data is needed:

```bash
cd /opt/apps/projects/chat-service
docker compose run --rm app yarn dev:seed:server
```

Manual checks:

- Open `http://192.168.22.37/chat/`.
- Verify desktop integration from `time-tracker-desktop`.
- Verify CORS from the desktop renderer origin. In desktop dev mode the actual Electron origin is
  `http://localhost:5175`; also allow `http://127.0.0.1:5175` when the renderer is loaded through loopback.
- Verify SSE realtime through `/chat/api/events`.
- Verify feature-specific chat behavior before merging to `develop`.

## Migration Script

`scripts/migrate-server.ps1` is separate from deploy. It:

- verifies `prisma/schema.prisma` exists locally
- verifies `prisma/migrations` exists locally and contains migration directories
- uploads only `schema.prisma` and `prisma/migrations`
- does not upload `.env`
- uses the server-side `.env` through compose `env_file`
- runs:

```bash
cd /opt/apps/projects/chat-service
docker compose run --rm app yarn prisma migrate deploy
docker compose ps
```

Run it after the first deploy and whenever the deployed image expects database changes from new Prisma migrations.

It uses the same SSH transport priority as deploy: explicit key, system SSH config or agent, then password fallback.

## Cleanup

After a successful deploy and health checks, cleanup runs unless `-SkipCleanup` is provided:

```bash
rm -f /opt/apps/images/chat-service.tar
rm -f /opt/apps/images/chat-service-playground.tar
docker image prune -f
```

The deploy script logs:

- disk usage before cleanup
- disk usage after cleanup
- `docker images chat-service` before and after cleanup
- `docker images chat-service-playground` before and after cleanup

Cleanup does not run:

- `docker system prune`
- `docker system prune -a`
- `docker volume prune`
- deletion of `/opt/apps/projects`
- deletion of `/opt/apps/backups`

To keep uploaded tarballs and skip Docker image pruning:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy-server.ps1 -SkipCleanup
```

Rollback warning: cleanup removes uploaded tarballs and dangling images, which can make a quick image rollback harder
unless known-good tarballs are stored elsewhere.

## Docker Compose

`deploy/docker-compose.server.yml` defines:

- `postgres` using `postgres:16-alpine`, bound to `127.0.0.1:55432:5432`
- `app` using `chat-service:latest`, bound to `127.0.0.1:4100:4100`, with `env_file: .env`
- `frontend` using `chat-service-playground:latest`, bound to `127.0.0.1:4101:80`

The `app` service does not run migrations automatically.

## Auth Environment

Production chat auth uses a signed internal bearer token created by the host app and verified by `chat-service`.
Configure the backend `.env` on the server:

```env
CHAT_INTERNAL_AUTH_SECRET=<shared random secret, 32+ chars>
CHAT_ALLOW_DEV_USER_ID=false
```

`CHAT_INTERNAL_AUTH_SECRET` must match the host app secret used to sign chat tokens. Rotate it as an application secret:
do not commit it and do not put real values into docs.

`CHAT_ALLOW_DEV_USER_ID` controls the legacy dev bridge:

- `false` in production: `x-user-id` and `/events?userId=` are rejected.
- `true` in local/dev smoke testing: HTTP `x-user-id` and SSE `?userId=` still work for the existing workflow.

Token payload:

```json
{
  "userId": "11111111-1111-4111-8111-111111111111",
  "displayName": "Artem",
  "issuedAt": 1779120000,
  "expiresAt": 1779120900,
  "source": "desktop"
}
```

The service validates HS256 signature and `expiresAt`. Missing auth, invalid signatures, and expired tokens return `401`.
Room membership and read-state permissions are unchanged.

Browser `EventSource` cannot set `Authorization`, so the widget uses:

```text
/chat/api/events?accessToken=<short-lived-chat-token>
```

This query token is intentionally short-lived. Avoid logging query strings at reverse proxies and treat access logs as
sensitive while this fallback is in use.

## Nginx

`deploy/nginx.chat-service.conf` is a location-only include for the existing server block. Do not convert it into a full
`server {}` config unless the host nginx layout changes.

The SSE location `/chat/api/events` must keep:

```nginx
proxy_http_version 1.1;
proxy_buffering off;
proxy_read_timeout 1h;
proxy_send_timeout 1h;
proxy_set_header Connection "";
proxy_set_header Origin $http_origin;
add_header X-Accel-Buffering no always;
```

Reload Nginx with the server's established workflow after validating the host config.

Before desktop smoke, verify that the proxied SSE response echoes the allowed Electron origin:

```bash
curl -i -N "http://192.168.22.37/chat/api/events?accessToken=<short-lived-chat-token>" \
  -H "Origin: http://localhost:5175"
```

Expected headers include `access-control-allow-origin: http://localhost:5175`,
`content-type: text/event-stream; charset=utf-8`, `cache-control: no-cache, no-transform`, and
`x-accel-buffering: no`. If Electron reports `readyState=2` or `TypeError: Failed to fetch` for the SSE URL while
HTTP API calls still work, treat it as an SSE CORS/header issue first.

## Staging Bearer Smoke - 2026-05-21

Staging was rechecked with `CHAT_ALLOW_DEV_USER_ID=false`.

- Server `.env` contains `DATABASE_URL`, `CHAT_INTERNAL_AUTH_SECRET`, `CHAT_ALLOW_DEV_USER_ID`, and
  `CHAT_CORS_ALLOWED_ORIGINS`; real values were not printed.
- `CHAT_INTERNAL_AUTH_SECRET` was already present, so no new secret was generated.
- `CHAT_ALLOW_DEV_USER_ID=false` was already set, and required desktop origins were present.
- `yarn prisma:generate`, `yarn type-check`, `yarn lint`, `yarn test`, and `yarn build` passed before deploy.
- `yarn deploy:server` used key-based SSH. The first attempt failed because Docker Desktop was not running locally; after
  starting Docker Desktop, deploy succeeded and recreated the app/playground containers.
- No Prisma migrations were run.
- External `/chat/api/health` returned `{"status":"ok"}`.
- `x-user-id`-only `/chat/api/rooms` returned `401`.
- `/chat/api/events?userId=<uuid>` returned `401`.
- Artem/Tester API smoke used temporary in-memory bearer tokens, exchanged messages in `Direct Chat`, and delivered the
  Tester reply to Artem over SSE through `/chat/api/events?accessToken=<short-lived-chat-token>`.

The desktop renderer must not know `CHAT_INTERNAL_AUTH_SECRET`. For desktop staging smoke, provide the matching secret
only through Electron main configuration such as a shell `CHAT_INTERNAL_AUTH_SECRET`. Browser playgrounds that still rely
on `x-user-id` need bearer support before they can be used for production-style smoke.

## Staging Bearer Smoke - 2026-05-20

Staging was verified with `CHAT_ALLOW_DEV_USER_ID=false`.

- Server `.env` contains `DATABASE_URL`, `CHAT_INTERNAL_AUTH_SECRET`, `CHAT_ALLOW_DEV_USER_ID`, and
  `CHAT_CORS_ALLOWED_ORIGINS`; real values were not printed.
- `x-user-id`-only `/chat/api/rooms` returned `401`.
- `/chat/api/events?userId=<uuid>` returned `401`.
- Bearer `/chat/api/rooms` accepted a short-lived Electron-main-compatible token.
- Bearer SSE `/chat/api/events?accessToken=<short-lived-chat-token>` returned `200 OK` and connected.
- Artem/Tester API smoke exchanged messages with temporary bearer tokens and delivered the Tester reply to Artem over
  SSE realtime.

The desktop renderer must not know `CHAT_INTERNAL_AUTH_SECRET`. For desktop staging smoke, provide the matching secret
only through Electron main configuration such as a shell `CHAT_INTERNAL_AUTH_SECRET`. Browser playgrounds that still rely
on `x-user-id` need bearer support before they can be used for production-style smoke.

## Rollback Notes

Image rollback does not roll back database migrations. Treat Prisma migration rollback as a separate data-model change
that needs explicit review.

Because this phase uses local tarballs rather than a registry, keep known-good image tarballs outside cleanup scope when
fast rollback matters.
