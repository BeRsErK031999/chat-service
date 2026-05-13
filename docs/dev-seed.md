# Dev Seed

The dev seed creates stable local data for checking the Phase 1B HTTP API and future UI work.

## Start PostgreSQL

```bash
docker compose -f docker-compose.postgres.yml up -d
```

The dev database is published on `localhost:55432`.

## Apply Migrations

PowerShell:

```powershell
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:55432/chat_service?schema=public"; yarn db:migrate
```

## Run Seed

PowerShell:

```powershell
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:55432/chat_service?schema=public"; yarn db:seed
```

The seed is idempotent. Re-running it updates the same dev users, room, memberships, messages, read states, and
employee notification instead of creating duplicates.

## Check API

Start the service:

```powershell
$env:PORT="4100"; $env:DATABASE_URL="postgresql://postgres:postgres@localhost:55432/chat_service?schema=public"; yarn dev
```

Use the user IDs printed by `yarn db:seed`:

```bash
curl -H "x-user-id: <employee-user-id>" http://localhost:4100/rooms
curl -H "x-user-id: <employee-user-id>" http://localhost:4100/rooms/<room-id>/messages
curl -H "x-user-id: <employee-user-id>" "http://localhost:4100/notifications?state=all"
```
