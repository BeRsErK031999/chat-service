import type { ReactElement } from 'react';
import { Fragment } from 'react';

import type { ChatWidgetContext, RoomListItem } from '../types';
import {
  formatRoomTypeLabel,
  formatTime,
  getPreview,
  getRoomLabel,
  getRoomScopeLabel,
  isTaskRoom,
} from './formatters';

type RoomListProps = {
  rooms: RoomListItem[];
  selectedRoomId: string | null;
  isLoading: boolean;
  context?: ChatWidgetContext;
  emptyLabel?: string | undefined;
  onSelectRoom: (roomId: string) => void;
};

type RoomGroup = {
  id: string;
  label: string;
  rooms: RoomListItem[];
};

const getRoomGroups = (rooms: RoomListItem[]): RoomGroup[] => {
  const taskRooms = rooms.filter(isTaskRoom);
  const conversationRooms = rooms.filter((room) => !isTaskRoom(room));
  const groups: RoomGroup[] = [];

  if (taskRooms.length > 0) {
    groups.push({
      id: 'task-discussions',
      label: 'Task discussions',
      rooms: taskRooms,
    });
  }

  if (conversationRooms.length > 0) {
    groups.push({
      id: 'recent-conversations',
      label: 'Recent conversations',
      rooms: conversationRooms,
    });
  }

  return groups;
};

export const RoomList = ({
  rooms,
  selectedRoomId,
  isLoading,
  context,
  emptyLabel = 'No rooms for this user. Run the dev seed.',
  onSelectRoom,
}: RoomListProps): ReactElement => {
  const roomGroups = getRoomGroups(rooms);

  return (
    <nav className="chat-ui-room-list" aria-label="Rooms">
      {rooms.length === 0 && !isLoading ? (
        <p className="chat-ui-empty-state">{emptyLabel}</p>
      ) : null}
      {roomGroups.map((group) => (
        <Fragment key={group.id}>
          <p className="chat-ui-room-group-label">{group.label}</p>
          {group.rooms.map((room) => {
            const activeClassName = room.id === selectedRoomId ? ' chat-ui-active' : '';
            const taskClassName = isTaskRoom(room) ? ' chat-ui-room-task' : '';
            const scopeLabel = getRoomScopeLabel(room, context);

            return (
              <button
                key={room.id}
                type="button"
                className={`chat-ui-room-item${activeClassName}${taskClassName}`}
                onClick={() => onSelectRoom(room.id)}
              >
                <span className="chat-ui-room-title-row">
                  <strong>{getRoomLabel(room)}</strong>
                  {room.unreadCount > 0 ? <em>{room.unreadCount}</em> : null}
                </span>
                <span className="chat-ui-room-badges">
                  <span>{formatRoomTypeLabel(room)}</span>
                  {scopeLabel !== null ? <span>{scopeLabel}</span> : null}
                </span>
                <span className="chat-ui-room-preview">{getPreview(room.lastMessage)}</span>
                <span className="chat-ui-room-meta">{formatTime(room.lastMessageAt)}</span>
              </button>
            );
          })}
        </Fragment>
      ))}
    </nav>
  );
};
