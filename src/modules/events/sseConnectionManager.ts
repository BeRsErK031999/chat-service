import type { ServerResponse } from 'node:http';

import type { ServerEventName, ServerEventPayload } from './eventTypes.js';

type SseConnection = {
  id: string;
  userId: string;
  response: ServerResponse;
};

export class SseConnectionManager {
  private readonly connectionsByUserId = new Map<string, Map<string, SseConnection>>();

  private nextConnectionId = 1;

  private heartbeatInterval: NodeJS.Timeout | null = null;

  public addConnection(userId: string, response: ServerResponse): () => void {
    const connectionId = String(this.nextConnectionId);
    this.nextConnectionId += 1;

    const connection: SseConnection = {
      id: connectionId,
      userId,
      response,
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
    this.writeComment(response, 'connected');

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
      connection.response.write(message);
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

    connections.delete(connection.id);

    if (connections.size === 0) {
      this.connectionsByUserId.delete(connection.userId);
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
      for (const connections of this.connectionsByUserId.values()) {
        for (const connection of connections.values()) {
          this.writeComment(connection.response, 'heartbeat');
        }
      }
    }, 25_000);
    this.heartbeatInterval.unref();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval === null) {
      return;
    }

    clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = null;
  }

  private writeComment(response: ServerResponse, comment: string): void {
    response.write(`: ${comment}\n\n`);
  }

  private formatEvent<TEventName extends ServerEventName>(
    eventName: TEventName,
    payload: ServerEventPayload<TEventName>,
  ): string {
    return `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  }
}

export const sseConnectionManager = new SseConnectionManager();
