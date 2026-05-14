export const DEFAULT_DEV_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5175',
  'http://localhost:4101',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5175',
  'http://127.0.0.1:4101',
] as const;

export const CORS_ALLOWED_METHODS = ['GET', 'POST', 'OPTIONS'] as const;
export const CORS_ALLOWED_HEADERS = ['content-type', 'x-user-id', 'idempotency-key'] as const;

export const parseChatCorsAllowedOrigins = (source: NodeJS.ProcessEnv): Set<string> => {
  const configuredOrigins = source.CHAT_CORS_ALLOWED_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  const origins =
    configuredOrigins && configuredOrigins.length > 0
      ? configuredOrigins
      : source.NODE_ENV === 'production'
        ? []
        : DEFAULT_DEV_CORS_ORIGINS;

  return new Set(origins);
};

export const isCorsOriginAllowed = (
  origin: string | undefined,
  allowedOrigins = parseChatCorsAllowedOrigins(process.env),
): boolean => origin === undefined || allowedOrigins.has(origin);

