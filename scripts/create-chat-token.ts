import { createChatInternalToken } from '../src/modules/auth/tokenService.js';
import type { ChatInternalTokenSource } from '../src/modules/auth/authTypes.js';

const allowedSources = ['desktop', 'web', 'playground'] as const satisfies readonly ChatInternalTokenSource[];

const readOption = (name: string): string | undefined => {
  const argumentsList = process.argv.slice(2);
  const prefix = `--${name}=`;
  const match = argumentsList.find((argument) => argument.startsWith(prefix));

  if (match !== undefined) {
    return match.slice(prefix.length);
  }

  const optionIndex = argumentsList.indexOf(`--${name}`);
  const nextArgument = argumentsList[optionIndex + 1];

  if (
    optionIndex !== -1 &&
    nextArgument !== undefined &&
    !nextArgument.startsWith('--')
  ) {
    return nextArgument;
  }

  return undefined;
};

const requireOption = (name: string): string => {
  const value = readOption(name);

  if (value === undefined || value.trim().length === 0) {
    throw new Error(`Missing --${name}=...`);
  }

  return value.trim();
};

const parseSource = (value: string): ChatInternalTokenSource => {
  if (value === 'desktop' || value === 'web' || value === 'playground') {
    return value;
  }

  throw new Error(`Invalid --source. Expected one of: ${allowedSources.join(', ')}`);
};

const parseTtlSeconds = (value: string | undefined): number => {
  const ttlSeconds = Number(value ?? '900');

  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > 3600) {
    throw new Error('--ttl must be an integer from 1 to 3600 seconds.');
  }

  return ttlSeconds;
};

const main = (): void => {
  const secret = process.env.CHAT_INTERNAL_AUTH_SECRET;

  if (secret === undefined || secret.trim().length === 0) {
    throw new Error('CHAT_INTERNAL_AUTH_SECRET must be set in the current shell.');
  }

  const userId = requireOption('userId');
  const displayName = requireOption('displayName');
  const source = parseSource(readOption('source') ?? 'playground');
  const ttlSeconds = parseTtlSeconds(readOption('ttl'));
  const issuedAt = Math.floor(Date.now() / 1000);

  const token = createChatInternalToken(
    {
      userId,
      displayName,
      issuedAt,
      expiresAt: issuedAt + ttlSeconds,
      source,
    },
    secret,
  );

  process.stdout.write(`${token}\n`);
};

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : 'Failed to create chat token.';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
