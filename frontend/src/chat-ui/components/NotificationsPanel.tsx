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

export const NotificationsPanel = ({
  notifications,
  isLoading,
  emptyLabel = 'No notifications.',
  onMarkNotificationRead,
  onNotificationClick,
}: NotificationsPanelProps): ReactElement => (
  <aside className="notifications">
    <div className="panel-header">
      <div>
        <p className="eyebrow">Notifications</p>
        <strong>{notifications.filter((item) => item.readAt === null).length} unread</strong>
      </div>
      {isLoading ? <span>Loading...</span> : null}
    </div>

    <div className="notification-list">
      {notifications.length === 0 && !isLoading ? (
        <p className="empty-state">{emptyLabel}</p>
      ) : null}
      {notifications.map((notification) => (
        <article
          key={notification.id}
          className={notification.readAt === null ? 'notification unread' : 'notification'}
          onClick={() => onNotificationClick?.(notification)}
        >
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
