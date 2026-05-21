import type { ServerResponse } from 'node:http';

import type { ServerEventName, ServerEventPayload } from './eventTypes.js';

type SseConnection = {
  id: string;
  userId: string;
  response: ServerResponse;
  lastWriteAt: number;
};

type SseConnectionManagerOptions = {
  heartbeatIntervalMs?: number;
  staleConnectionMs?: number;
  onUserOnline?: (userId: string) => void;
  onUserOffline?: (userId: string) => void;
};

export class SseConnectionManager {
  private readonly connectionsByUserId = new Map<string, Map<string, SseConnection>>();

  private nextConnectionId = 1;

  private heartbeatInterval: NodeJS.Timeout | null = null;

  private readonly heartbeatIntervalMs: number;

  private readonly staleConnectionMs: number;

  private onUserOnline: ((userId: string) => void) | undefined;

  private onUserOffline: ((userId: string) => void) | undefined;

  public constructor(options: SseConnectionManagerOptions = {}) {
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 25_000;
    this.staleConnectionMs = options.staleConnectionMs ?? 90_000;
    this.onUserOnline = options.onUserOnline;
    this.onUserOffline = options.onUserOffline;
  }

  public setLifecycleHandlers(handlers: {
    onUserOnline?: (userId: string) => void;
    onUserOffline?: (userId: string) => void;
  }): void {
    this.onUserOnline = handlers.onUserOnline;
    this.onUserOffline = handlers.onUserOffline;
  }

  public addConnection(userId: string, response: ServerResponse): () => void {
    const connectionId = String(this.nextConnectionId);
    this.nextConnectionId += 1;
    const wasOffline = this.getConnectionCount(userId) === 0;

    const connection: SseConnection = {
      id: connectionId,
      userId,
      response,
      lastWriteAt: Date.now(),
    };

    const userConnections = this.connectionsByUserId.get(userId) ?? new Map<string, SseConnection>();
    userConnections.set(connectionId, connection);
    this.connectionsByUserId.set(userId, userConnections);
    this.startHeartbeat();

    const cleanup = (): void => {
      this.removeConnection(connection);
    };

    response.on('close', cleanup);
    response.on('error', cleanup);
    this.writeComment(connection, 'connected');

    if (wasOffline) {
      this.onUserOnline?.(userId);
    }

    return cleanup;
  }

  public sendToUser<TEventName extends ServerEventName>(
    userId: string,
    eventName: TEventName,
    payload: ServerEventPayload<TEventName>,
  ): void {
    const connections = this.connectionsByUserId.get(userId);

    if (connections === undefined) {
      return;
    }

    const message = this.formatEvent(eventName, payload);

    for (const connection of connections.values()) {
      this.writeConnection(connection, message);
    }
  }

  public getConnectionCount(userId?: string): number {
    if (userId !== undefined) {
      return this.connectionsByUserId.get(userId)?.size ?? 0;
    }

    let count = 0;
    for (const connections of this.connectionsByUserId.values()) {
      count += connections.size;
    }

    return count;
  }

  public closeAll(): void {
    for (const connections of this.connectionsByUserId.values()) {
      for (const connection of connections.values()) {
        connection.response.end();
      }
    }

    this.connectionsByUserId.clear();
    this.stopHeartbeat();
  }

  private removeConnection(connection: SseConnection): void {
    const connections = this.connectionsByUserId.get(connection.userId);

    if (connections === undefined) {
      return;
    }

    const hadConnection = connections.delete(connection.id);

    if (!hadConnection) {
      return;
    }

    if (connections.size === 0) {
      this.connectionsByUserId.delete(connection.userId);
      this.onUserOffline?.(connection.userId);
    }

    if (this.getConnectionCount() === 0) {
      this.stopHeartbeat();
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval !== null) {
      return;
    }

    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      for (const connections of this.connectionsByUserId.values()) {
        for (const connection of connections.values()) {
          if (connection.response.destroyed || connection.response.writableEnded) {
            this.removeConnection(connection);
            continue;
          }

          if (now - connection.lastWriteAt > this.staleConnectionMs) {
            connection.response.end();
            this.removeConnection(connection);
            continue;
          }

          this.writeComment(connection, 'heartbeat');
        }
      }
    }, this.heartbeatIntervalMs);
    this.heartbeatInterval.unref();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval === null) {
      return;
    }

    clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = null;
  }

  private writeComment(connection: SseConnection, comment: string): void {
    this.writeConnection(connection, `: ${comment}\n\n`);
  }

  private writeConnection(connection: SseConnection, chunk: string): void {
    try {
      connection.response.write(chunk);
      connection.lastWriteAt = Date.now();
    } catch {
      connection.response.end();
      this.removeConnection(connection);
    }
  }

  private formatEvent<TEventName extends ServerEventName>(
    eventName: TEventName,
    payload: ServerEventPayload<TEventName>,
  ): string {
    return `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  }
}

export const sseConnectionManager = new SseConnectionManager();
