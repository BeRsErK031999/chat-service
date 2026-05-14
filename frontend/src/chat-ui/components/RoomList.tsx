import type { ReactElement } from 'react';

import type { RoomListItem } from '../types';
import { formatTime, getPreview, getRoomLabel } from './formatters';

type RoomListProps = {
  rooms: RoomListItem[];
  selectedRoomId: string | null;
  isLoading: boolean;
  emptyLabel?: string | undefined;
  onSelectRoom: (roomId: string) => void;
};

export const RoomList = ({
  rooms,
  selectedRoomId,
  isLoading,
  emptyLabel = 'No rooms for this user. Run the dev seed.',
  onSelectRoom,
}: RoomListProps): ReactElement => (
  <nav className="room-list" aria-label="Rooms">
    {rooms.length === 0 && !isLoading ? (
      <p className="empty-state">{emptyLabel}</p>
    ) : null}
    {rooms.map((room) => (
      <button
        key={room.id}
        type="button"
        className={room.id === selectedRoomId ? 'room-item active' : 'room-item'}
        onClick={() => onSelectRoom(room.id)}
      >
        <span className="room-title-row">
          <strong>{getRoomLabel(room)}</strong>
          {room.unreadCount > 0 ? <em>{room.unreadCount}</em> : null}
        </span>
        <span className="room-preview">{getPreview(room.lastMessage)}</span>
        <span className="room-meta">{formatTime(room.lastMessageAt)}</span>
      </button>
    ))}
  </nav>
);
