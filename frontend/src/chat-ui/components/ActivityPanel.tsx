import type { ReactElement } from 'react';

import { splitChatActivityItems } from '../activity';
import type { ChatActivityItem } from '../types';
import { formatTime } from './formatters';

type ActivityPanelProps = {
  items: ChatActivityItem[];
  isLoading: boolean;
  emptyLabel?: string | undefined;
  onActivityItemClick: (item: ChatActivityItem) => void;
  onMarkNotificationRead: (notificationId: string) => void;
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
): ReactElement => {
  const isUnread = item.attentionState === 'attention-needed';
  const unreadNotificationId = isUnread ? item.notificationId : undefined;

  return (
    <article
      key={item.id}
      className={isUnread ? 'chat-ui-activity-item chat-ui-activity-unread' : 'chat-ui-activity-item'}
    >
      <button type="button" className="chat-ui-activity-open" onClick={() => onActivityItemClick(item)}>
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
}: ActivityPanelProps): ReactElement => {
  const sections = splitChatActivityItems(items);

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
          <section className="chat-ui-activity-section" aria-label="Needs attention">
            <p className="chat-ui-room-group-label">Needs attention</p>
            {sections.needsAttention.map((item) =>
              renderActivityItem(item, onActivityItemClick, onMarkNotificationRead),
            )}
          </section>
        ) : null}
        {sections.recentActivity.length > 0 ? (
          <section className="chat-ui-activity-section" aria-label="Recent activity">
            <p className="chat-ui-room-group-label">Recent activity</p>
            {sections.recentActivity.map((item) =>
              renderActivityItem(item, onActivityItemClick, onMarkNotificationRead),
            )}
          </section>
        ) : null}
      </div>
    </aside>
  );
};
