# Server Deploy

`chat-service` deploys to the local Docker platform on the Ubuntu server. There is no registry, CI workflow,
Kubernetes, or direct public Docker port exposure in this phase.

## Architecture

- Build the Docker image locally on Windows.
- Build the frontend playground image locally on Windows.
- Save the images as `chat-service.tar` and `chat-service-playground.tar`.
- Upload the image tarballs to `/opt/apps/images`.
- Upload the project compose file to `/opt/apps/projects/chat-service/docker-compose.yml`.
- Load and deploy through the existing server scripts in `/opt/apps/scripts`.
- The backend container publishes only `127.0.0.1:4100:4100`.
- The frontend playground container publishes only `127.0.0.1:4101:80`.
- Nginx proxies public HTTP/HTTPS traffic to `http://127.0.0.1:4100`.
- Nginx proxies `/chat/` to the frontend playground and `/chat/api/` to the backend.

## Workflow

After pushing `main`, deploy from the local Windows workstation:

```powershell
yarn deploy:server
```

The script runs local checks, builds `chat-service:latest` and `chat-service-playground:latest`, saves both image
tarballs, uploads them with `scp`, and then runs:

```bash
cd /opt/apps
./scripts/load-image.sh /opt/apps/images/chat-service.tar
./scripts/load-image.sh /opt/apps/images/chat-service-playground.tar
./scripts/deploy-project.sh chat-service
```

`yarn deploy:server` updates only the Docker image and container. It intentionally does not apply Prisma
migrations.

After the first deploy, and after any deploy that includes new Prisma migrations, run the separate migration command:

```powershell
yarn deploy:migrate:server
```

## Server Cleanup

After a successful deploy and health check, `scripts/deploy-server.ps1` performs a narrow cleanup on the server:

```bash
rm -f /opt/apps/images/chat-service.tar
rm -f /opt/apps/images/chat-service-playground.tar
docker image prune -f --filter label=app=chat-service
docker images chat-service
docker images chat-service-playground
```

The script logs disk usage and `chat-service` / `chat-service-playground` images before and after cleanup.

Cleanup removes the uploaded `chat-service.tar`, `chat-service-playground.tar`, and dangling Docker images with the
`app=chat-service` label only. It does not remove Docker volumes, running containers, `/opt/apps/projects`,
`/opt/apps/backups`, or tagged images for other projects. The deploy script does not run `docker system prune` or
`docker volume prune`.

To keep the uploaded tarball and skip image pruning for a deploy:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy-server.ps1 -SkipCleanup
```

## Required Server `.env`

Create this file manually on the server:

```text
/opt/apps/projects/chat-service/.env
```

Use `deploy/.env.server.example` as the template:

```env
PORT=4100
LOG_LEVEL=info
DATABASE_URL=<server-postgres-url>
AUTH_MODE=standalone
```

Do not commit real server secrets.

## Database

The deploy script does not apply Prisma migrations on the server. Apply migrations manually with:

```powershell
yarn deploy:migrate:server
```

The migration script verifies that local `prisma/migrations` exists, uploads only `prisma/schema.prisma` and
`prisma/migrations` to:

```text
/opt/apps/projects/chat-service/prisma
```

It does not upload `.env` files. On the server it uses the existing project `.env` through `docker-compose.yml` and
runs:

```bash
cd /opt/apps/projects/chat-service
docker compose run --rm app yarn prisma migrate deploy
docker compose ps
```

Use this command after the first deploy and whenever the deployed image expects database changes from new Prisma
migrations.

## Nginx

Copy or adapt `deploy/nginx.chat-service.conf` into:

```text
/opt/apps/nginx/conf.d/chat-service.conf
```

Set `server_name` to the real domain when one exists. The template proxies to:

```text
http://127.0.0.1:4100
```

It also exposes the manual playground at:

```text
http://192.168.22.37/chat/
```

and proxies playground API calls from `/chat/api/` to the backend.

Reload Nginx using the server's established workflow after validating the config. Do not edit the global
`nginx.conf` for this service.

## Health Check

The deploy script checks:

```bash
docker ps --filter name=chat-service
curl -f http://127.0.0.1:4100/health
curl -f http://127.0.0.1:4101/
```

For logs:

```bash
cd /opt/apps
./scripts/logs-project.sh chat-service
```

## Rollback Basics

This phase uses local image tarballs instead of a registry. To roll back, load a previously saved image tarball and
redeploy:

```bash
cd /opt/apps
./scripts/load-image.sh /opt/apps/images/<previous-chat-service-image>.tar
./scripts/deploy-project.sh chat-service
```

Keep known-good image tarballs under `/opt/apps/images` or restore them from backups before deploying. If deploy
cleanup removed old image tarballs or dangling images, fast rollback to an older image may not be available until the
older image is restored or rebuilt.

Rolling back the image does not automatically roll back database migrations. Treat Prisma migration rollback as a
separate data-model operation and review it before applying any database changes.
