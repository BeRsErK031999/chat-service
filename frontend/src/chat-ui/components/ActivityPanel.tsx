import { useMemo, useRef } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';

import { splitChatActivityItems } from '../activity';
import type { ChatActivityItem } from '../types';
import { formatTime } from './formatters';

type ActivityPanelProps = {
  items: ChatActivityItem[];
  isLoading: boolean;
  emptyLabel?: string | undefined;
  onActivityItemClick: (item: ChatActivityItem) => void;
  onMarkNotificationRead: (notificationId: string) => void;
  onEscape?: () => void;
};

const getActivityCue = (item: ChatActivityItem): string => {
  if (item.kind === 'notification') {
    return item.attentionState === 'attention-needed' ? 'Needs attention' : 'Read';
  }

  if (item.unreadCount !== undefined && item.unreadCount > 0) {
    return item.unreadCount === 1 ? '1 unread' : `${item.unreadCount} unread`;
  }

  return 'Recent';
};

const getActivityScope = (item: ChatActivityItem): string => {
  if (item.kind === 'notification') {
    return item.priority === 'HIGH' ? 'High priority' : 'Notification';
  }

  return item.taskId !== undefined ? 'Task discussion' : 'Room';
};

const renderActivityItem = (
  item: ChatActivityItem,
  onActivityItemClick: (item: ChatActivityItem) => void,
  onMarkNotificationRead: (notificationId: string) => void,
  registerActivityButton: (itemId: string, element: HTMLButtonElement | null) => void,
  onActivityItemKeyDown: (event: KeyboardEvent<HTMLButtonElement>, item: ChatActivityItem) => void,
): ReactElement => {
  const isUnread = item.attentionState === 'attention-needed';
  const unreadNotificationId = isUnread ? item.notificationId : undefined;

  return (
    <article
      key={item.id}
      className={isUnread ? 'chat-ui-activity-item chat-ui-activity-unread' : 'chat-ui-activity-item'}
    >
      <button
        ref={(element) => registerActivityButton(item.id, element)}
        type="button"
        className="chat-ui-activity-open"
        aria-label={`Open activity: ${item.title}`}
        onClick={() => onActivityItemClick(item)}
        onKeyDown={(event) => onActivityItemKeyDown(event, item)}
      >
        <span className="chat-ui-notification-meta">
          <span>{getActivityCue(item)}</span>
          <span>{getActivityScope(item)}</span>
        </span>
        <strong>{item.title}</strong>
        {item.summary !== undefined ? <span className="chat-ui-activity-summary">{item.summary}</span> : null}
        <time>{formatTime(item.occurredAt)}</time>
      </button>
      {unreadNotificationId !== undefined ? (
        <button type="button" onClick={() => onMarkNotificationRead(unreadNotificationId)}>
          Mark read
        </button>
      ) : null}
    </article>
  );
};

export const ActivityPanel = ({
  items,
  isLoading,
  emptyLabel = 'No activity yet.',
  onActivityItemClick,
  onMarkNotificationRead,
  onEscape,
}: ActivityPanelProps): ReactElement => {
  const sections = splitChatActivityItems(items);
  const orderedItems = useMemo(
    () => [...sections.needsAttention, ...sections.recentActivity],
    [sections.needsAttention, sections.recentActivity],
  );
  const activityButtonRefs = useRef(new Map<string, HTMLButtonElement>());

  const registerActivityButton = (itemId: string, element: HTMLButtonElement | null): void => {
    if (element === null) {
      activityButtonRefs.current.delete(itemId);
      return;
    }

    activityButtonRefs.current.set(itemId, element);
  };

  const focusRelativeActivityItem = (item: ChatActivityItem, direction: 1 | -1): void => {
    if (orderedItems.length === 0) {
      return;
    }

    const selectedIndex = orderedItems.findIndex((activityItem) => activityItem.id === item.id);
    const fallbackIndex = direction === 1 ? 0 : orderedItems.length - 1;
    const nextIndex =
      selectedIndex === -1
        ? fallbackIndex
        : (selectedIndex + direction + orderedItems.length) % orderedItems.length;
    const nextItem = orderedItems[nextIndex];

    if (nextItem === undefined) {
      return;
    }

    const nextButton = activityButtonRefs.current.get(nextItem.id);
    nextButton?.focus({ preventScroll: true });
    nextButton?.scrollIntoView({ block: 'nearest' });
  };

  const handleActivityItemKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    item: ChatActivityItem,
  ): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusRelativeActivityItem(item, 1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusRelativeActivityItem(item, -1);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.currentTarget.blur();
      onEscape?.();
    }
  };

  return (
    <aside className="chat-ui-activity-panel">
      <div className="chat-ui-panel-header">
        <div>
          <p className="chat-ui-eyebrow">Activity</p>
          <strong>{sections.needsAttention.length} need attention</strong>
        </div>
        {isLoading ? <span>Loading...</span> : null}
      </div>

      <div className="chat-ui-activity-list">
        {items.length === 0 && !isLoading ? (
          <p className="chat-ui-empty-state">{emptyLabel}</p>
        ) : null}
        {sections.needsAttention.length > 0 ? (
          <section
            className="chat-ui-activity-section chat-ui-activity-section-attention"
            aria-label="Needs attention"
          >
            <p className="chat-ui-room-group-label">Needs attention</p>
            {sections.needsAttention.map((item) =>
              renderActivityItem(
                item,
                onActivityItemClick,
                onMarkNotificationRead,
                registerActivityButton,
                handleActivityItemKeyDown,
              ),
            )}
          </section>
        ) : null}
        {sections.recentActivity.length > 0 ? (
          <section
            className="chat-ui-activity-section chat-ui-activity-section-recent"
            aria-label="Recent activity"
          >
            <p className="chat-ui-room-group-label">Recent activity</p>
            {sections.recentActivity.map((item) =>
              renderActivityItem(
                item,
                onActivityItemClick,
                onMarkNotificationRead,
                registerActivityButton,
                handleActivityItemKeyDown,
              ),
            )}
          </section>
        ) : null}
      </div>
    </aside>
  );
};
