import type { KeyboardEvent, ReactElement, Ref } from 'react';
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
  searchInputRef?: Ref<HTMLInputElement>;
  searchQuery: string;
  emptyLabel?: string | undefined;
  searchEmptyLabel?: string | undefined;
  onSearchQueryChange: (query: string) => void;
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

const getRoomActivityTime = (room: RoomListItem): number => {
  if (room.lastMessageAt === null) {
    return 0;
  }

  const timestamp = new Date(room.lastMessageAt).getTime();

  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const compareRoomsByWorkflowPriority = (left: RoomListItem, right: RoomListItem): number => {
  if (left.unreadCount !== right.unreadCount) {
    return right.unreadCount - left.unreadCount;
  }

  return getRoomActivityTime(right) - getRoomActivityTime(left);
};

const getSearchText = (room: RoomListItem, context?: ChatWidgetContext): string =>
  [
    getRoomLabel(room),
    formatRoomTypeLabel(room),
    getRoomScopeLabel(room, context),
    room.taskId,
    room.projectId,
    getPreview(room.lastMessage),
  ]
    .filter((value): value is string => value !== null && value !== undefined)
    .join(' ')
    .toLowerCase();

const getVisibleRooms = (
  rooms: RoomListItem[],
  searchQuery: string,
  context?: ChatWidgetContext,
): RoomListItem[] => {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const matchingRooms =
    normalizedQuery.length === 0
      ? rooms
      : rooms.filter((room) => getSearchText(room, context).includes(normalizedQuery));

  return [...matchingRooms].sort(compareRoomsByWorkflowPriority);
};

export const RoomList = ({
  rooms,
  selectedRoomId,
  isLoading,
  context,
  searchInputRef,
  searchQuery,
  emptyLabel = 'No rooms for this user. Run the dev seed.',
  searchEmptyLabel = 'No rooms match this search.',
  onSearchQueryChange,
  onSelectRoom,
}: RoomListProps): ReactElement => {
  const visibleRooms = getVisibleRooms(rooms, searchQuery, context);
  const roomGroups = getRoomGroups(visibleRooms);
  const hasSearch = searchQuery.trim().length > 0;

  const selectRelativeRoom = (direction: 1 | -1): void => {
    if (visibleRooms.length === 0) {
      return;
    }

    const selectedIndex = visibleRooms.findIndex((room) => room.id === selectedRoomId);
    const fallbackIndex = direction === 1 ? 0 : visibleRooms.length - 1;
    const nextIndex =
      selectedIndex === -1
        ? fallbackIndex
        : (selectedIndex + direction + visibleRooms.length) % visibleRooms.length;

    const nextRoom = visibleRooms[nextIndex];

    if (nextRoom !== undefined) {
      onSelectRoom(nextRoom.id);
    }
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      selectRelativeRoom(1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      selectRelativeRoom(-1);
      return;
    }

    if (event.key === 'Enter' && visibleRooms.length > 0) {
      event.preventDefault();
      const firstRoom = visibleRooms[0];

      if (firstRoom !== undefined) {
        onSelectRoom(firstRoom.id);
      }
    }
  };

  return (
    <nav className="chat-ui-room-list" aria-label="Rooms">
      <div className="chat-ui-room-search">
        <input
          ref={searchInputRef}
          value={searchQuery}
          type="search"
          placeholder="Search rooms"
          aria-label="Search rooms"
          onChange={(event) => onSearchQueryChange(event.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
      </div>
      {rooms.length === 0 && !isLoading ? (
        <p className="chat-ui-empty-state">{emptyLabel}</p>
      ) : null}
      {rooms.length > 0 && visibleRooms.length === 0 && !isLoading ? (
        <p className="chat-ui-empty-state">{hasSearch ? searchEmptyLabel : emptyLabel}</p>
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
                aria-current={room.id === selectedRoomId ? 'true' : undefined}
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
