import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';

import type { ChatMessage, PresenceState, RoomListItem } from '../types';
import { formatTime, getPresenceLabel } from './formatters';

type MessageListProps = {
  messages: ChatMessage[];
  selectedRoom: RoomListItem | null;
  currentUserId: string;
  presenceByUserId: ReadonlyMap<string, PresenceState>;
  highlightedMessageId?: string;
  isLoading: boolean;
  onRetryMessage: (messageId: string) => void;
  messagesEmptyLabel?: string | undefined;
  selectRoomEmptyLabel?: string | undefined;
};

export const MessageList = ({
  messages,
  selectedRoom,
  currentUserId,
  presenceByUserId,
  highlightedMessageId,
  isLoading,
  onRetryMessage,
  messagesEmptyLabel = 'No messages yet.',
  selectRoomEmptyLabel = 'Choose a room to read messages.',
}: MessageListProps): ReactElement => {
  const highlightedMessageRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    highlightedMessageRef.current?.scrollIntoView({
      block: 'center',
      behavior: 'smooth',
    });
  }, [highlightedMessageId, messages]);

  return (
    <div className="chat-ui-message-list">
      {isLoading ? <p className="chat-ui-loading-state">Loading messages...</p> : null}
      {selectedRoom === null && !isLoading ? (
        <p className="chat-ui-empty-state">{selectRoomEmptyLabel}</p>
      ) : null}
      {selectedRoom !== null && messages.length === 0 && !isLoading ? (
        <p className="chat-ui-empty-state">{messagesEmptyLabel}</p>
      ) : null}
      {messages.map((message) => {
        const isHighlighted = message.id === highlightedMessageId;

        return (
          <article
            key={message.id}
            ref={isHighlighted ? highlightedMessageRef : undefined}
            className={
              [
                'chat-ui-message',
                message.senderUserId === currentUserId ? 'chat-ui-message-mine' : null,
                'clientState' in message ? `chat-ui-message-${message.clientState}` : null,
                isHighlighted ? 'chat-ui-message-highlighted' : null,
              ]
                .filter(Boolean)
                .join(' ')
            }
          >
            <div className="chat-ui-message-meta">
              <span className="chat-ui-presence-line">
                {message.senderUserId !== null ? (
                  <span
                    className={
                      presenceByUserId.get(message.senderUserId)?.status === 'online'
                        ? 'chat-ui-presence-dot chat-ui-presence-online'
                        : 'chat-ui-presence-dot'
                    }
                    aria-label={getPresenceLabel(presenceByUserId.get(message.senderUserId))}
                    title={getPresenceLabel(presenceByUserId.get(message.senderUserId))}
                  />
                ) : null}
                {message.senderUserId === null ? 'System' : message.senderUserId}
              </span>
              {'clientState' in message ? (
                <span>{message.clientState === 'pending' ? 'Sending...' : 'Send failed'}</span>
              ) : (
                <time>{formatTime(message.createdAt)}</time>
              )}
            </div>
            <p>{message.type === 'SYSTEM_EVENT' ? message.eventType : message.body}</p>
            {'clientState' in message && message.clientState === 'error' ? (
              <button type="button" onClick={() => onRetryMessage(message.id)}>
                Retry
              </button>
            ) : null}
          </article>
        );
      })}
    </div>
  );
};
