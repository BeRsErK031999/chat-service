# Local PostgreSQL

This project can run integration smoke tests against a local PostgreSQL container.

## Start PostgreSQL

```bash
docker compose -f docker-compose.postgres.yml up -d
```

The container listens on PostgreSQL's internal port `5432`, but the host port is `55432` to avoid conflicts with a
system PostgreSQL installed on `localhost:5432`.

Connection string:

```text
postgresql://postgres:postgres@localhost:55432/chat_service?schema=public
```

Copy `.env.local.example` to `.env.local` for local app settings if needed. The Prisma CLI still needs `DATABASE_URL` in the current shell or `.env`.

## Apply Migrations

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:55432/chat_service?schema=public" yarn db:migrate --name init
```

On Windows PowerShell:

```powershell
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:55432/chat_service?schema=public"; yarn db:migrate --name init
```

## Run Integration Smoke Test

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:55432/chat_service?schema=public" yarn test:integration
```

On Windows PowerShell:

```powershell
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:55432/chat_service?schema=public"; yarn test:integration
```

The regular `yarn test` command does not require PostgreSQL.

## Reset Local Data

Stop the container and remove the PostgreSQL volume:

```bash
docker compose -f docker-compose.postgres.yml down -v
```

## Troubleshooting

The compose file publishes PostgreSQL on host port `55432` because `5432` is often owned by a system PostgreSQL
installation. If you still see authentication errors, confirm `DATABASE_URL` points to `localhost:55432`.
