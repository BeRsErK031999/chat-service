# Server Deploy

`chat-service` deploys from the Windows workstation to the Ubuntu Docker host. There is no registry, CI deploy,
Kubernetes, or public Docker port exposure in this phase.

## Server Layout

- SSH: `admin_devops@192.168.22.37`
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

Configure SSH key auth first; it is the normal deploy path. Password deploy is only a temporary fallback.

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
rollout and data-model changes can be reviewed independently.

## SSH Authentication

Key-based SSH is the normal deploy mode. Generate a dedicated deploy key on Windows:

```powershell
ssh-keygen -t ed25519 -C "chat-service-deploy"
```

For example, save it as:

```text
C:\Users\<you>\.ssh\chat-service-deploy
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

Then run:

```powershell
yarn deploy:server
yarn deploy:migrate:server
```

Transport priority is:

1. `CHAT_SERVICE_DEPLOY_SSH_KEY`
2. normal `ssh`/`scp` using the system SSH config or agent
3. `CHAT_SERVICE_DEPLOY_PASSWORD` as temporary emergency fallback

The scripts run an SSH preflight before Docker build or upload. If SSH is unavailable, they fail with:

```text
SSH access failed. Configure key auth or set CHAT_SERVICE_DEPLOY_PASSWORD for temporary fallback.
```

Do not commit private keys, passwords, or real server `.env` files.

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
key-based paths are unavailable and `CHAT_SERVICE_DEPLOY_PASSWORD` is set, it uses the password fallback.

The script requires the server-side `.env` to already exist:

```text
/opt/apps/projects/chat-service/.env
```

Use `deploy/.env.server.example` as a template and never commit real server secrets.

For desktop/web host CORS, the server-side `.env` must include the allowed browser origins:

```env
CHAT_CORS_ALLOWED_ORIGINS=http://localhost:5175,http://127.0.0.1:5175,http://192.168.22.37
```

Requests without an `Origin` header, such as curl, server-side checks, and health checks, are still allowed. Browser
requests are allowed only when the `Origin` value is in this comma-separated allowlist. CORS is handled by Fastify; do
not add a duplicate CORS workaround in nginx.

After changing the server `.env`, restart the app container. If an image change is included, run:

```powershell
yarn deploy:server
```

If only `.env` changed and the current image is already correct, restart with the server's compose workflow:

```bash
cd /opt/apps/projects/chat-service
docker compose up -d
```

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

## Nginx

`deploy/nginx.chat-service.conf` is a location-only include for the existing server block. Do not convert it into a full
`server {}` config unless the host nginx layout changes.

The SSE location `/chat/api/events` must keep:

```nginx
proxy_http_version 1.1;
proxy_buffering off;
proxy_read_timeout 1h;
```

CORS headers are emitted by the Fastify app, including for `/chat/api/events`; nginx should keep proxying OPTIONS and SSE
without adding its own CORS headers.

Reload Nginx with the server's established workflow after validating the host config.

## Rollback Notes

Image rollback does not roll back database migrations. Treat Prisma migration rollback as a separate data-model change
that needs explicit review.

Because this phase uses local tarballs rather than a registry, keep known-good image tarballs outside cleanup scope when
fast rollback matters.
