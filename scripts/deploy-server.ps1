param(
  [switch]$SkipCleanup
)

$ErrorActionPreference = "Stop"

$ProjectName = "chat-service"
$BackendImage = "chat-service:latest"
$FrontendImage = "chat-service-playground:latest"
$ServerUser = "admin_devops"
$ServerHost = "192.168.22.37"
$Server = "$ServerUser@$ServerHost"
$ServerRootDir = "/opt/apps"
$ServerProjectDir = "$ServerRootDir/projects/$ProjectName"
$ServerImagesDir = "$ServerRootDir/images"
$ServerNginxIncludeDir = "$ServerRootDir/nginx/conf.d"
$BackendTarName = "chat-service.tar"
$FrontendTarName = "chat-service-playground.tar"
$LocalImageDir = Join-Path ([System.IO.Path]::GetTempPath()) "$ProjectName-deploy-images"
$LocalBackendTar = Join-Path $LocalImageDir $BackendTarName
$LocalFrontendTar = Join-Path $LocalImageDir $FrontendTarName
$DeploySshKey = $env:CHAT_SERVICE_DEPLOY_SSH_KEY
$UsePasswordTransport = $false
$UseSshKeyTransport = $false

function Test-SshAccess {
  param(
    [string]$KeyPath
  )

  $sshArgs = @("-o", "BatchMode=yes", "-o", "ConnectTimeout=10")

  if (-not [string]::IsNullOrWhiteSpace($KeyPath)) {
    $sshArgs += @("-i", $KeyPath)
  }

  $sshArgs += @($Server, "true")
  & ssh @sshArgs *> $null

  return $LASTEXITCODE -eq 0
}

function Select-Transport {
  if (-not [string]::IsNullOrWhiteSpace($DeploySshKey)) {
    if (-not (Test-Path -LiteralPath $DeploySshKey -PathType Leaf)) {
      throw "SSH key file from CHAT_SERVICE_DEPLOY_SSH_KEY was not found."
    }

    if (-not (Test-SshAccess $DeploySshKey)) {
      throw "SSH access failed with CHAT_SERVICE_DEPLOY_SSH_KEY. Check the key path and server authorized_keys."
    }

    $script:UseSshKeyTransport = $true
    Write-Host "Using SSH key transport from CHAT_SERVICE_DEPLOY_SSH_KEY."
    return
  }

  if (Test-SshAccess "") {
    Write-Host "Using system ssh/scp transport."
    return
  }

  if (-not [string]::IsNullOrWhiteSpace($env:CHAT_SERVICE_DEPLOY_PASSWORD)) {
    $script:UsePasswordTransport = $true
    Write-Host "Using password-based SSH transport from CHAT_SERVICE_DEPLOY_PASSWORD as temporary fallback."
    return
  }

  throw "SSH access failed. Configure key auth or set CHAT_SERVICE_DEPLOY_PASSWORD for temporary fallback."
}

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

function Copy-PasswordToServer {
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

function Invoke-Remote {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command
  )

  if ($UsePasswordTransport) {
    Invoke-PasswordRemote $Command
    return
  }

  $sshArgs = @()

  if ($UseSshKeyTransport) {
    $sshArgs += @("-i", $DeploySshKey)
  }

  $sshArgs += @($Server, $Command)
  & ssh @sshArgs

  if ($LASTEXITCODE -ne 0) {
    throw "Remote command failed with exit code $LASTEXITCODE"
  }
}

function Copy-ToServer {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Source,
    [Parameter(Mandatory = $true)]
    [string]$Destination
  )

  if ($UsePasswordTransport) {
    Copy-PasswordToServer $Source $Destination
    return
  }

  $scpArgs = @()

  if ($UseSshKeyTransport) {
    $scpArgs += @("-i", $DeploySshKey)
  }

  $scpArgs += @($Source, "${Server}:$Destination")
  & scp @scpArgs

  if ($LASTEXITCODE -ne 0) {
    throw "SCP upload failed with exit code $LASTEXITCODE"
  }
}

if (-not (Test-Path -LiteralPath "Dockerfile" -PathType Leaf)) {
  throw "Missing backend Dockerfile."
}

if (-not (Test-Path -LiteralPath "Dockerfile.frontend" -PathType Leaf)) {
  throw "Missing frontend Dockerfile.frontend."
}

if (-not (Test-Path -LiteralPath "deploy/docker-compose.server.yml" -PathType Leaf)) {
  throw "Missing deploy/docker-compose.server.yml."
}

if (-not (Test-Path -LiteralPath "deploy/nginx.chat-service.conf" -PathType Leaf)) {
  throw "Missing deploy/nginx.chat-service.conf."
}

New-Item -ItemType Directory -Force -Path $LocalImageDir | Out-Null

Write-Host "Checking SSH access before Docker build..."
Select-Transport

Write-Host "Building backend image $BackendImage..."
docker build -t $BackendImage -f Dockerfile .

Write-Host "Building frontend image $FrontendImage..."
docker build -t $FrontendImage -f Dockerfile.frontend .

Write-Host "Saving images locally..."
docker save -o $LocalBackendTar $BackendImage
docker save -o $LocalFrontendTar $FrontendImage

Write-Host "Preparing server directories..."
Invoke-Remote "mkdir -p $ServerImagesDir $ServerProjectDir"

Write-Host "Uploading image tarballs..."
Copy-ToServer $LocalBackendTar "$ServerImagesDir/$BackendTarName"
Copy-ToServer $LocalFrontendTar "$ServerImagesDir/$FrontendTarName"

Write-Host "Uploading docker compose file..."
Copy-ToServer "deploy/docker-compose.server.yml" "$ServerProjectDir/docker-compose.yml"

Write-Host "Uploading nginx include config..."
Copy-ToServer "deploy/nginx.chat-service.conf" "$ServerProjectDir/nginx.chat-service.conf"
Invoke-Remote "if [ -d '$ServerNginxIncludeDir' ]; then cp '$ServerProjectDir/nginx.chat-service.conf' '$ServerNginxIncludeDir/chat-service.conf'; fi"

Write-Host "Verifying server-side .env exists; deploy does not upload secrets..."
Invoke-Remote "test -f $ServerProjectDir/.env"

Write-Host "Loading Docker images on server..."
Invoke-Remote "docker load -i $ServerImagesDir/$BackendTarName && docker load -i $ServerImagesDir/$FrontendTarName"

Write-Host "Starting compose project without running migrations..."
Invoke-Remote "cd $ServerProjectDir && docker compose up -d"

Write-Host "Checking compose project status..."
Invoke-Remote "cd $ServerProjectDir && docker compose ps"

Write-Host "Checking backend health endpoint..."
Invoke-Remote "curl -fsS http://127.0.0.1:4100/health"

Write-Host "Checking frontend endpoint..."
Invoke-Remote "curl -fsS http://127.0.0.1:4101/ >/dev/null"

if ($SkipCleanup) {
  Write-Host "Skipping server cleanup because -SkipCleanup was provided."
} else {
  Write-Host "Server disk usage before cleanup:"
  Invoke-Remote "df -h $ServerRootDir || df -h"

  Write-Host "Server chat-service images before cleanup:"
  Invoke-Remote "docker images chat-service"

  Write-Host "Server chat-service-playground images before cleanup:"
  Invoke-Remote "docker images chat-service-playground"

  Write-Host "Removing uploaded tarballs and pruning dangling Docker images..."
  Invoke-Remote "rm -f $ServerImagesDir/$BackendTarName $ServerImagesDir/$FrontendTarName && docker image prune -f"

  Write-Host "Server disk usage after cleanup:"
  Invoke-Remote "df -h $ServerRootDir || df -h"

  Write-Host "Server chat-service images after cleanup:"
  Invoke-Remote "docker images chat-service"

  Write-Host "Server chat-service-playground images after cleanup:"
  Invoke-Remote "docker images chat-service-playground"
}

Write-Host "Cleaning local temporary image tarballs..."
Remove-Item -LiteralPath $LocalBackendTar, $LocalFrontendTar -Force -ErrorAction SilentlyContinue

Write-Host "Server deploy complete."
