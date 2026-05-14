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

The script requires the server-side `.env` to already exist:

```text
/opt/apps/projects/chat-service/.env
```

Use `deploy/.env.server.example` as a template and never commit real server secrets.

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

Reload Nginx with the server's established workflow after validating the host config.

## Rollback Notes

Image rollback does not roll back database migrations. Treat Prisma migration rollback as a separate data-model change
that needs explicit review.

Because this phase uses local tarballs rather than a registry, keep known-good image tarballs outside cleanup scope when
fast rollback matters.
