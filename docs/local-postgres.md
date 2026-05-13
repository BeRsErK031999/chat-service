# Local PostgreSQL

This project can run integration smoke tests against a local PostgreSQL container.

## Start PostgreSQL

```bash
docker compose -f docker-compose.postgres.yml up -d
```

Connection string:

```text
postgresql://postgres:postgres@localhost:5432/chat_service?schema=public
```

Copy `.env.local.example` to `.env.local` for local app settings if needed. The Prisma CLI still needs `DATABASE_URL` in the current shell or `.env`.

## Apply Migrations

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/chat_service?schema=public" yarn db:migrate --name init
```

On Windows PowerShell:

```powershell
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/chat_service?schema=public"; yarn db:migrate --name init
```

## Run Integration Smoke Test

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/chat_service?schema=public" yarn test:integration
```

On Windows PowerShell:

```powershell
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/chat_service?schema=public"; yarn test:integration
```

The regular `yarn test` command does not require PostgreSQL.

## Reset Local Data

Stop the container and remove the PostgreSQL volume:

```bash
docker compose -f docker-compose.postgres.yml down -v
```

## Troubleshooting

The compose file publishes PostgreSQL on host port `5432`. If another local PostgreSQL process already owns that
port, Prisma commands using `localhost:5432` may connect to the wrong server and fail authentication. Stop the
conflicting local PostgreSQL process or adjust your local environment before running migrations and integration tests.
