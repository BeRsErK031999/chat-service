import type { ReactElement } from 'react';

import type { Message, RoomListItem } from '../types';
import { formatTime } from './formatters';

type MessageListProps = {
  messages: Message[];
  selectedRoom: RoomListItem | null;
  currentUserId: string;
  isLoading: boolean;
  messagesEmptyLabel?: string | undefined;
  selectRoomEmptyLabel?: string | undefined;
};

export const MessageList = ({
  messages,
  selectedRoom,
  currentUserId,
  isLoading,
  messagesEmptyLabel = 'No messages yet.',
  selectRoomEmptyLabel = 'Choose a room to read messages.',
}: MessageListProps): ReactElement => (
  <div className="messages">
    {isLoading ? <p className="loading-state">Loading messages...</p> : null}
    {selectedRoom === null && !isLoading ? (
      <p className="empty-state">{selectRoomEmptyLabel}</p>
    ) : null}
    {selectedRoom !== null && messages.length === 0 && !isLoading ? (
      <p className="empty-state">{messagesEmptyLabel}</p>
    ) : null}
    {messages.map((message) => (
      <article
        key={message.id}
        className={message.senderUserId === currentUserId ? 'message mine' : 'message'}
      >
        <div className="message-meta">
          <span>{message.senderUserId === null ? 'System' : message.senderUserId}</span>
          <time>{formatTime(message.createdAt)}</time>
        </div>
        <p>{message.type === 'SYSTEM_EVENT' ? message.eventType : message.body}</p>
      </article>
    ))}
  </div>
);
