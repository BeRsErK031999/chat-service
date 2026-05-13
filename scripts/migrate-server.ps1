$ErrorActionPreference = "Stop"

$ProjectName = "chat-service"
$ServerUser = "admin_devops"
$ServerHost = "192.168.22.37"
$Server = "$ServerUser@$ServerHost"
$ServerProjectDir = "/opt/apps/projects/$ProjectName"
$LocalPrismaDir = "prisma"
$LocalSchemaPath = Join-Path $LocalPrismaDir "schema.prisma"
$LocalMigrationsDir = Join-Path $LocalPrismaDir "migrations"

if (-not (Test-Path -LiteralPath $LocalSchemaPath -PathType Leaf)) {
  throw "Missing local Prisma schema: $LocalSchemaPath"
}

if (-not (Test-Path -LiteralPath $LocalMigrationsDir -PathType Container)) {
  throw "Missing local Prisma migrations directory: $LocalMigrationsDir"
}

$MigrationDirectories = Get-ChildItem -LiteralPath $LocalMigrationsDir -Directory
if ($MigrationDirectories.Count -eq 0) {
  throw "No local Prisma migration directories found in $LocalMigrationsDir"
}

Write-Host "Uploading Prisma schema and migrations to server..."
Write-Host "The script uploads schema.prisma and migrations only; .env files are not uploaded."
ssh $Server "mkdir -p $ServerProjectDir/prisma && rm -rf $ServerProjectDir/prisma/migrations"
scp $LocalSchemaPath "${Server}:${ServerProjectDir}/prisma/schema.prisma"
scp -r $LocalMigrationsDir "${Server}:${ServerProjectDir}/prisma/"

Write-Host "Applying Prisma migrations on the server with docker compose..."
ssh $Server "cd $ServerProjectDir && docker compose run --rm app yarn prisma migrate deploy"

Write-Host "Checking compose project status..."
ssh $Server "cd $ServerProjectDir && docker compose ps"

Write-Host "Server migration complete."
