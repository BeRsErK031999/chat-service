import type { ReactElement } from 'react';

import type { ChatMessage, RoomListItem } from '../types';
import { formatTime } from './formatters';

type MessageListProps = {
  messages: ChatMessage[];
  selectedRoom: RoomListItem | null;
  currentUserId: string;
  isLoading: boolean;
  onRetryMessage: (messageId: string) => void;
  messagesEmptyLabel?: string | undefined;
  selectRoomEmptyLabel?: string | undefined;
};

export const MessageList = ({
  messages,
  selectedRoom,
  currentUserId,
  isLoading,
  onRetryMessage,
  messagesEmptyLabel = 'No messages yet.',
  selectRoomEmptyLabel = 'Choose a room to read messages.',
}: MessageListProps): ReactElement => (
  <div className="chat-ui-message-list">
    {isLoading ? <p className="chat-ui-loading-state">Loading messages...</p> : null}
    {selectedRoom === null && !isLoading ? (
      <p className="chat-ui-empty-state">{selectRoomEmptyLabel}</p>
    ) : null}
    {selectedRoom !== null && messages.length === 0 && !isLoading ? (
      <p className="chat-ui-empty-state">{messagesEmptyLabel}</p>
    ) : null}
    {messages.map((message) => (
      <article
        key={message.id}
        className={
          [
            'chat-ui-message',
            message.senderUserId === currentUserId ? 'chat-ui-message-mine' : null,
            'clientState' in message ? `chat-ui-message-${message.clientState}` : null,
          ]
            .filter(Boolean)
            .join(' ')
        }
      >
        <div className="chat-ui-message-meta">
          <span>{message.senderUserId === null ? 'System' : message.senderUserId}</span>
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
    ))}
  </div>
);
