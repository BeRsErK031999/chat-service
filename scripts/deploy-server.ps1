param(
  [switch]$SkipCleanup
)

$ErrorActionPreference = "Stop"

$ProjectName = "chat-service"
$BackendImageName = "chat-service:latest"
$FrontendImageName = "chat-service-playground:latest"
$BackendTarName = "chat-service.tar"
$FrontendTarName = "chat-service-playground.tar"
$ServerUser = "admin_devops"
$ServerHost = "192.168.22.37"
$Server = "$ServerUser@$ServerHost"
$ServerImagesDir = "/opt/apps/images"
$ServerProjectDir = "/opt/apps/projects/$ProjectName"
$ServerBackendTarPath = "$ServerImagesDir/$BackendTarName"
$ServerFrontendTarPath = "$ServerImagesDir/$FrontendTarName"

Write-Host "Running local checks..."
yarn prisma:generate
yarn type-check
yarn lint
yarn test
yarn build

Write-Host "Building Docker image $BackendImageName..."
docker build -t $BackendImageName .

Write-Host "Building Docker image $FrontendImageName..."
$PreviousDockerBuildkit = $env:DOCKER_BUILDKIT
$env:DOCKER_BUILDKIT = "0"
try {
  docker build -f Dockerfile.frontend -t $FrontendImageName .
} finally {
  $env:DOCKER_BUILDKIT = $PreviousDockerBuildkit
}

Write-Host "Saving Docker image to $BackendTarName..."
if (Test-Path $BackendTarName) {
  Remove-Item -LiteralPath $BackendTarName
}
docker save $BackendImageName -o $BackendTarName

Write-Host "Saving Docker image to $FrontendTarName..."
if (Test-Path $FrontendTarName) {
  Remove-Item -LiteralPath $FrontendTarName
}
docker save $FrontendImageName -o $FrontendTarName

Write-Host "Ensuring server project directory exists..."
ssh $Server "mkdir -p $ServerImagesDir $ServerProjectDir"

Write-Host "Uploading images and compose template..."
scp ".\$BackendTarName" "${Server}:${ServerImagesDir}/"
scp ".\$FrontendTarName" "${Server}:${ServerImagesDir}/"
scp "deploy/docker-compose.server.yml" "${Server}:${ServerProjectDir}/docker-compose.yml"

Write-Host ""
Write-Host "Reminder: create or update ${ServerProjectDir}/.env on the server before first deploy."
Write-Host "Use deploy/.env.server.example as the template and do not commit real secrets."
Write-Host ""

Write-Host "Loading images and deploying project..."
ssh $Server "cd /opt/apps && ./scripts/load-image.sh $ServerBackendTarPath && ./scripts/load-image.sh $ServerFrontendTarPath && ./scripts/deploy-project.sh $ProjectName"

Write-Host "Checking deployed containers and health endpoints..."
ssh $Server "docker ps --filter name=$ProjectName && curl -f http://127.0.0.1:4100/health && curl -f http://127.0.0.1:4101/"

if ($SkipCleanup) {
  Write-Host "Skipping server Docker artifact cleanup because -SkipCleanup was provided."
} else {
  Write-Host "Server disk usage before cleanup..."
  ssh $Server "df -h / /opt/apps || df -h"

  Write-Host "Server chat-service images before cleanup..."
  ssh $Server "docker images chat-service && docker images chat-service-playground"

  Write-Host "Cleaning up uploaded tar and dangling Docker images..."
  ssh $Server "rm -f $ServerBackendTarPath $ServerFrontendTarPath && docker image prune -f --filter label=app=$ProjectName"

  Write-Host "Server disk usage after cleanup..."
  ssh $Server "df -h / /opt/apps || df -h"

  Write-Host "Server chat-service images after cleanup..."
  ssh $Server "docker images chat-service && docker images chat-service-playground"
}

Write-Host "Deploy complete."
