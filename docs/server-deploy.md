# Server Deploy

`chat-service` deploys to the local Docker platform on the Ubuntu server. There is no registry, CI workflow,
Kubernetes, or direct public Docker port exposure in this phase.

## Architecture

- Build the Docker image locally on Windows.
- Save the image as `chat-service.tar`.
- Upload the image tarball to `/opt/apps/images`.
- Upload the project compose file to `/opt/apps/projects/chat-service/docker-compose.yml`.
- Load and deploy through the existing server scripts in `/opt/apps/scripts`.
- The container publishes only `127.0.0.1:4100:4100`.
- Nginx proxies public HTTP/HTTPS traffic to `http://127.0.0.1:4100`.

## Workflow

After pushing `main`, deploy from the local Windows workstation:

```powershell
yarn deploy:server
```

The script runs local checks, builds `chat-service:latest`, saves `chat-service.tar`, uploads it with `scp`, and
then runs:

```bash
cd /opt/apps
./scripts/load-image.sh /opt/apps/images/chat-service.tar
./scripts/deploy-project.sh chat-service
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

The deploy script does not apply Prisma migrations on the server in this phase. Before the first service start, make
sure the server PostgreSQL database has the required schema using the server's established database migration
workflow.

## Nginx

Copy or adapt `deploy/nginx.chat-service.conf` into:

```text
/opt/apps/nginx/conf.d/chat-service.conf
```

Set `server_name` to the real domain when one exists. The template proxies to:

```text
http://127.0.0.1:4100
```

Reload Nginx using the server's established workflow after validating the config. Do not edit the global
`nginx.conf` for this service.

## Health Check

The deploy script checks:

```bash
docker ps --filter name=chat-service
curl -f http://127.0.0.1:4100/health
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

Keep known-good image tarballs under `/opt/apps/images` or restore them from backups before deploying.
