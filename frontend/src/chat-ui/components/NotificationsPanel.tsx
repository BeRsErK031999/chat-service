import type { ReactElement } from 'react';

import type { Notification } from '../types';
import { formatTime } from './formatters';

type NotificationsPanelProps = {
  notifications: Notification[];
  isLoading: boolean;
  emptyLabel?: string | undefined;
  onMarkNotificationRead: (notificationId: string) => void;
  onNotificationClick?: ((notification: Notification) => void) | undefined;
};

const compareNotificationsByWorkflowPriority = (
  left: Notification,
  right: Notification,
): number => {
  const leftUnread = left.readAt === null ? 1 : 0;
  const rightUnread = right.readAt === null ? 1 : 0;

  if (leftUnread !== rightUnread) {
    return rightUnread - leftUnread;
  }

  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
};

const formatNotificationPriority = (notification: Notification): string => {
  if (notification.priority === 'HIGH') {
    return 'High priority';
  }

  if (notification.priority === 'LOW') {
    return 'Low priority';
  }

  return 'Normal priority';
};

export const NotificationsPanel = ({
  notifications,
  isLoading,
  emptyLabel = 'No notifications.',
  onMarkNotificationRead,
  onNotificationClick,
}: NotificationsPanelProps): ReactElement => {
  const sortedNotifications = [...notifications].sort(compareNotificationsByWorkflowPriority);

  return (
    <aside className="chat-ui-notifications">
      <div className="chat-ui-panel-header">
        <div>
          <p className="chat-ui-eyebrow">Notifications</p>
          <strong>{notifications.filter((item) => item.readAt === null).length} unread</strong>
        </div>
        {isLoading ? <span>Loading...</span> : null}
      </div>

      <div className="chat-ui-notification-list">
        {notifications.length === 0 && !isLoading ? (
          <p className="chat-ui-empty-state">{emptyLabel}</p>
        ) : null}
        {sortedNotifications.map((notification) => (
          <article
            key={notification.id}
            className={
              notification.readAt === null
                ? 'chat-ui-notification chat-ui-notification-unread'
                : 'chat-ui-notification'
            }
            onClick={() => onNotificationClick?.(notification)}
          >
            <span className="chat-ui-notification-meta">
              <span>{notification.readAt === null ? 'Needs attention' : 'Read'}</span>
              <span>{formatNotificationPriority(notification)}</span>
            </span>
            <strong>{notification.title}</strong>
            <p>{notification.body}</p>
            <time>{formatTime(notification.createdAt)}</time>
            {notification.readAt === null ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onMarkNotificationRead(notification.id);
                }}
              >
                Mark read
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </aside>
  );
};
