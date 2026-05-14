$ErrorActionPreference = "Stop"

$ProjectName = "chat-service"
$ServerUser = "admin_devops"
$ServerHost = "192.168.22.37"
$Server = "$ServerUser@$ServerHost"
$ServerProjectDir = "/opt/apps/projects/$ProjectName"
$LocalPrismaDir = "prisma"
$LocalSchemaPath = Join-Path $LocalPrismaDir "schema.prisma"
$LocalMigrationsDir = Join-Path $LocalPrismaDir "migrations"
$UsePasswordTransport = -not [string]::IsNullOrWhiteSpace($env:CHAT_SERVICE_DEPLOY_PASSWORD)

function Invoke-PasswordRemote {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command
  )

  $env:CHAT_SERVICE_DEPLOY_HOST = $ServerHost
  $env:CHAT_SERVICE_DEPLOY_USER = $ServerUser
  $env:CHAT_SERVICE_REMOTE_COMMAND = $Command

  try {
    python -c @'
import os
import sys
import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(
    os.environ['CHAT_SERVICE_DEPLOY_HOST'],
    username=os.environ['CHAT_SERVICE_DEPLOY_USER'],
    password=os.environ['CHAT_SERVICE_DEPLOY_PASSWORD'],
    look_for_keys=False,
    allow_agent=False,
    timeout=30,
)
stdin, stdout, stderr = client.exec_command(os.environ['CHAT_SERVICE_REMOTE_COMMAND'])
sys.stdout.buffer.write(stdout.read())
sys.stdout.buffer.flush()
sys.stderr.buffer.write(stderr.read())
sys.stderr.buffer.flush()
exit_code = stdout.channel.recv_exit_status()
client.close()
sys.exit(exit_code)
'@
    if ($LASTEXITCODE -ne 0) {
      throw "Remote command failed with exit code $LASTEXITCODE"
    }
  } finally {
    Remove-Item Env:\CHAT_SERVICE_DEPLOY_HOST -ErrorAction SilentlyContinue
    Remove-Item Env:\CHAT_SERVICE_DEPLOY_USER -ErrorAction SilentlyContinue
    Remove-Item Env:\CHAT_SERVICE_REMOTE_COMMAND -ErrorAction SilentlyContinue
  }
}

function Copy-PasswordFileToServer {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Source,
    [Parameter(Mandatory = $true)]
    [string]$Destination
  )

  $env:CHAT_SERVICE_DEPLOY_HOST = $ServerHost
  $env:CHAT_SERVICE_DEPLOY_USER = $ServerUser
  $env:CHAT_SERVICE_LOCAL_SOURCE = (Resolve-Path -LiteralPath $Source).Path
  $env:CHAT_SERVICE_REMOTE_DESTINATION = $Destination

  try {
    python -c @'
import os
import sys
import paramiko

transport = paramiko.Transport((os.environ['CHAT_SERVICE_DEPLOY_HOST'], 22))
transport.connect(
    username=os.environ['CHAT_SERVICE_DEPLOY_USER'],
    password=os.environ['CHAT_SERVICE_DEPLOY_PASSWORD'],
)
sftp = paramiko.SFTPClient.from_transport(transport)
sftp.put(os.environ['CHAT_SERVICE_LOCAL_SOURCE'], os.environ['CHAT_SERVICE_REMOTE_DESTINATION'])
sftp.close()
transport.close()
sys.exit(0)
'@
    if ($LASTEXITCODE -ne 0) {
      throw "SFTP upload failed with exit code $LASTEXITCODE"
    }
  } finally {
    Remove-Item Env:\CHAT_SERVICE_DEPLOY_HOST -ErrorAction SilentlyContinue
    Remove-Item Env:\CHAT_SERVICE_DEPLOY_USER -ErrorAction SilentlyContinue
    Remove-Item Env:\CHAT_SERVICE_LOCAL_SOURCE -ErrorAction SilentlyContinue
    Remove-Item Env:\CHAT_SERVICE_REMOTE_DESTINATION -ErrorAction SilentlyContinue
  }
}

function Copy-PasswordDirectoryToServer {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Source,
    [Parameter(Mandatory = $true)]
    [string]$Destination
  )

  $env:CHAT_SERVICE_DEPLOY_HOST = $ServerHost
  $env:CHAT_SERVICE_DEPLOY_USER = $ServerUser
  $env:CHAT_SERVICE_LOCAL_SOURCE = (Resolve-Path -LiteralPath $Source).Path
  $env:CHAT_SERVICE_REMOTE_DESTINATION = $Destination

  try {
    python -c @'
import os
import posixpath
import sys
import paramiko

def mkdir_p(sftp, path):
    parts = [part for part in path.split('/') if part]
    current = ''
    for part in parts:
        current = current + '/' + part
        try:
            sftp.mkdir(current)
        except OSError:
            pass

transport = paramiko.Transport((os.environ['CHAT_SERVICE_DEPLOY_HOST'], 22))
transport.connect(
    username=os.environ['CHAT_SERVICE_DEPLOY_USER'],
    password=os.environ['CHAT_SERVICE_DEPLOY_PASSWORD'],
)
sftp = paramiko.SFTPClient.from_transport(transport)
source = os.environ['CHAT_SERVICE_LOCAL_SOURCE']
destination = os.environ['CHAT_SERVICE_REMOTE_DESTINATION']
mkdir_p(sftp, destination)
for root, _dirs, files in os.walk(source):
    relative_root = os.path.relpath(root, source)
    remote_root = destination if relative_root == '.' else posixpath.join(destination, relative_root.replace(os.sep, '/'))
    mkdir_p(sftp, remote_root)
    for file_name in files:
        sftp.put(os.path.join(root, file_name), posixpath.join(remote_root, file_name))
sftp.close()
transport.close()
sys.exit(0)
'@
    if ($LASTEXITCODE -ne 0) {
      throw "SFTP directory upload failed with exit code $LASTEXITCODE"
    }
  } finally {
    Remove-Item Env:\CHAT_SERVICE_DEPLOY_HOST -ErrorAction SilentlyContinue
    Remove-Item Env:\CHAT_SERVICE_DEPLOY_USER -ErrorAction SilentlyContinue
    Remove-Item Env:\CHAT_SERVICE_LOCAL_SOURCE -ErrorAction SilentlyContinue
    Remove-Item Env:\CHAT_SERVICE_REMOTE_DESTINATION -ErrorAction SilentlyContinue
  }
}

function Invoke-Remote {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command
  )

  if ($UsePasswordTransport) {
    Invoke-PasswordRemote $Command
    return
  }

  ssh $Server $Command
}

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
if ($UsePasswordTransport) {
  Write-Host "Using password-based SSH transport from CHAT_SERVICE_DEPLOY_PASSWORD."
  Invoke-Remote "mkdir -p $ServerProjectDir/prisma && rm -rf $ServerProjectDir/prisma/migrations"
  Copy-PasswordFileToServer $LocalSchemaPath "$ServerProjectDir/prisma/schema.prisma"
  Copy-PasswordDirectoryToServer $LocalMigrationsDir "$ServerProjectDir/prisma/migrations"
} else {
  Write-Host "Using system ssh/scp transport."
  ssh $Server "mkdir -p $ServerProjectDir/prisma && rm -rf $ServerProjectDir/prisma/migrations"
  scp $LocalSchemaPath "${Server}:${ServerProjectDir}/prisma/schema.prisma"
  scp -r $LocalMigrationsDir "${Server}:${ServerProjectDir}/prisma/"
}

Write-Host "Applying Prisma migrations on the server with docker compose..."
Invoke-Remote "cd $ServerProjectDir && docker compose run --rm app yarn prisma migrate deploy"

Write-Host "Checking compose project status..."
Invoke-Remote "cd $ServerProjectDir && docker compose ps"

Write-Host "Server migration complete."
