$ErrorActionPreference = "Stop"

$ProjectName = "chat-service"
$ImageName = "chat-service:latest"
$TarName = "chat-service.tar"
$ServerUser = "admin_devops"
$ServerHost = "192.168.22.37"
$Server = "$ServerUser@$ServerHost"
$ServerImagesDir = "/opt/apps/images"
$ServerProjectDir = "/opt/apps/projects/$ProjectName"
$ServerTarPath = "$ServerImagesDir/$TarName"

Write-Host "Running local checks..."
yarn prisma:generate
yarn type-check
yarn lint
yarn test
yarn build

Write-Host "Building Docker image $ImageName..."
docker build -t $ImageName .

Write-Host "Saving Docker image to $TarName..."
if (Test-Path $TarName) {
  Remove-Item -LiteralPath $TarName
}
docker save $ImageName -o $TarName

Write-Host "Ensuring server project directory exists..."
ssh $Server "mkdir -p $ServerImagesDir $ServerProjectDir"

Write-Host "Uploading image and compose template..."
scp ".\$TarName" "${Server}:${ServerImagesDir}/"
scp "deploy/docker-compose.server.yml" "${Server}:${ServerProjectDir}/docker-compose.yml"

Write-Host ""
Write-Host "Reminder: create or update ${ServerProjectDir}/.env on the server before first deploy."
Write-Host "Use deploy/.env.server.example as the template and do not commit real secrets."
Write-Host ""

Write-Host "Loading image and deploying project..."
ssh $Server "cd /opt/apps && ./scripts/load-image.sh $ServerTarPath && ./scripts/deploy-project.sh $ProjectName"

Write-Host "Checking deployed container and health endpoint..."
ssh $Server "docker ps --filter name=$ProjectName && curl -f http://127.0.0.1:4100/health"

Write-Host "Deploy complete."
