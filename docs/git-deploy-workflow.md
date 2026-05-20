# Git and Staging Deploy Workflow

This repository uses GitLab as the primary remote for `develop` and `main`. Feature work is checked on the staging/test
server before it is merged into shared branches.

## Current Repository State

Observed on 2026-05-19:

- `origin` fetch points to GitLab: `https://gitlab.truebim-6d.ru/tts/messager/chat-service.git`.
- `origin` push has GitLab and GitHub URLs configured. Treat GitLab as the source of truth for `develop` and `main`.
- Local branches include `feature/chat-work`, `develop`, and `main`.
- Remote branches include `origin/develop` and `origin/main`.

Do not push directly to `main` from a feature branch. Do not store deploy secrets, server passwords, private keys, or real
`.env` files in the repository.

## Branch Model

- `feature/*`: development and staging validation branches.
- `develop`: integration branch for work that passed staging deploy smoke checks.
- `main`: stable release branch only.

Recommended flow:

1. Create a feature branch from the latest `develop`.
2. Implement and validate locally.
3. Deploy the current local feature branch to the staging/test server.
4. Run staging smoke checks.
5. Merge to `develop` only after the staging smoke is successful.
6. Merge to `main` only for stable release promotion.

## Create a Feature Branch

```powershell
git fetch origin
git switch develop
git pull --ff-only origin develop
git switch -c feature/<short-topic>
```

Keep commits focused and use Conventional Commits, for example:

```text
feat(chat): add room unread state
fix(deploy): keep migrations separate from image rollout
docs(deploy): document staging smoke workflow
```

## Local Checks Before Staging

Run the normal project checks before deploying a feature branch:

```powershell
yarn prisma:generate
yarn type-check
yarn lint
yarn test
yarn build
```

Inspect the diff before deploy:

```powershell
git status --short
git diff
```

Confirm no secrets, debug code, temporary comments, or unrelated file changes are present.

## Staging Deploy From a Feature Branch

The server `192.168.22.37` is the staging/test server for pre-merge verification.

`yarn deploy:server` builds and deploys the current local checkout. That means the branch selected in the working tree is
the branch being deployed.

```powershell
git branch --show-current
yarn deploy:server
```

Use SSH key auth as the normal deploy path:

```powershell
$env:CHAT_SERVICE_DEPLOY_SSH_KEY="C:\Users\<user>\.ssh\chat-service-staging"
yarn deploy:server
```

Run migrations separately only when the branch contains new Prisma migrations:

```powershell
yarn deploy:migrate:server
```

Do not add auto migration to deploy. Image rollout and database migration must remain separate operations.

## Staging Smoke Checklist

Run these checks for each feature branch before merging:

```powershell
yarn type-check
yarn lint
yarn test
yarn build
yarn deploy:server
```

If the feature adds or requires new Prisma migrations:

```powershell
yarn deploy:migrate:server
```

Optional dev smoke data:

```bash
cd /opt/apps/projects/chat-service
docker compose run --rm app yarn dev:seed:server
```

Manual smoke:

- Open `http://192.168.22.37/chat/`.
- Verify the chat API under `http://192.168.22.37/chat/api`.
- Verify desktop integration from `time-tracker-desktop`.
- Verify CORS from the desktop renderer origin.
- Verify SSE realtime through `/chat/api/events`.
- Verify messages, room loading, unread state, and auth behavior relevant to the feature.

## Merge to Develop

Merge a feature branch into `develop` only after:

- local checks pass;
- staging deploy succeeds;
- migrations, if any, were applied separately and verified;
- staging smoke checks pass;
- no secrets or unrelated changes are in the diff.

Recommended commands:

```powershell
git fetch origin
git switch develop
git pull --ff-only origin develop
git merge --no-ff feature/<short-topic>
yarn type-check
yarn lint
yarn test
git push origin develop
```

If the team uses GitLab merge requests, open an MR from `feature/<short-topic>` to `develop` instead of merging locally.

## Merge to Main

Use `main` only for stable releases. Promote `develop` to `main` after release-level validation:

```powershell
git fetch origin
git switch main
git pull --ff-only origin main
git merge --no-ff origin/develop
yarn type-check
yarn lint
yarn test
yarn build
git push origin main
```

Do not push automatically to `main` during feature deploy or staging validation.

## SSH Key Setup

Generate a dedicated staging deploy key on the workstation:

```powershell
ssh-keygen -t ed25519 -C "chat-service-staging"
```

Save it outside the repository, for example:

```text
C:\Users\<user>\.ssh\chat-service-staging
```

Add the public key to the staging server user:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
cat chat-service-staging.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Verify SSH access:

```powershell
ssh -i "C:\Users\<user>\.ssh\chat-service-staging" admin_devops@192.168.22.37
```

Use the key for deploy:

```powershell
$env:CHAT_SERVICE_DEPLOY_SSH_KEY="C:\Users\<user>\.ssh\chat-service-staging"
```

`CHAT_SERVICE_DEPLOY_PASSWORD` exists only as an emergency fallback. Do not document, print, commit, or share the server
password.

## Rollback Notes

Image rollback and database rollback are separate concerns. Rolling back containers does not undo Prisma migrations.

Because this phase deploys local Docker tarballs instead of pushing images to a registry, keep known-good tarballs outside
the cleanup scope when fast rollback matters. If cleanup has removed the tarballs, rebuild or redeploy the last known-good
commit.

For a fast application rollback:

1. Switch to the last known-good commit or branch.
2. Run local checks.
3. Run `yarn deploy:server`.
4. Verify `/chat/`, `/chat/api/health`, desktop integration, CORS, and SSE realtime.

## Migration Notes

Prisma migrations are explicit data model changes. Review them separately from application deploys.

- Do not run migrations automatically during `yarn deploy:server`.
- Run `yarn deploy:migrate:server` only when new migration directories are part of the branch.
- Confirm the server `.env` already exists and is not uploaded by deploy scripts.
- Plan rollback manually before applying destructive or non-backward-compatible migrations.
- Coordinate `develop` and `main` promotion with migration state on the staging/test server and production target.
