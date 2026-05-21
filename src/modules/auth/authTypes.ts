export type ChatInternalTokenSource = 'desktop' | 'web' | 'playground';

export type ChatInternalTokenPayload = {
  userId: string;
  displayName: string;
  issuedAt: number;
  expiresAt: number;
  source: ChatInternalTokenSource;
};

export type AuthenticatedUser = {
  id: string;
  displayName?: string;
  source?: ChatInternalTokenSource;
};

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}
