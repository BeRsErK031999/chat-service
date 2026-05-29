import { useMemo, useRef } from 'react';
import type { KeyboardEvent, ReactElement, RefObject } from 'react';

import { splitChatActivityItems } from '../activity';
import type { ChatActivityItem } from '../types';
import { formatTime } from './formatters';

type ActivityPanelProps = {
  items: ChatActivityItem[];
  isLoading: boolean;
  canOpenLatestUnread: boolean;
  canOpenRecentTask: boolean;
  emptyLabel?: string | undefined;
  isShortcutHelpOpen: boolean;
  shortcutHelpButtonRef?: RefObject<HTMLButtonElement | null>;
  onActivityItemClick: (item: ChatActivityItem) => void;
  onCopyActivityReference: (item: ChatActivityItem) => void;
  onMarkNotificationRead: (notificationId: string) => void;
  onOpenLatestUnread: () => void;
  onOpenRecentTask: () => void;
  onShortcutHelpOpenChange: (isOpen: boolean) => void;
  onEscape?: () => void;
};

const keyboardShortcuts = [
  ['ArrowUp / ArrowDown', 'Move through activity items'],
  ['Enter', 'Open selected activity'],
  ['Ctrl/Cmd+C', 'Copy selected activity ref'],
  ['Shift+Enter', 'Mark selected notification read'],
  ['Escape', 'Return to composer/search'],
  ['Alt+ArrowUp / Alt+ArrowDown', 'Switch rooms'],
  ['Alt+Shift+ArrowUp / Alt+Shift+ArrowDown', 'Cycle workflow activity'],
  ['Ctrl/Cmd+K', 'Jump to room search'],
  ['/', 'Focus room search'],
] as const;

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
  onCopyActivityReference: (item: ChatActivityItem) => void,
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
      <div className="chat-ui-activity-actions" aria-label={`Actions for ${item.title}`}>
        <button type="button" onClick={() => onCopyActivityReference(item)}>
          Copy ref
        </button>
        {unreadNotificationId !== undefined ? (
          <button type="button" onClick={() => onMarkNotificationRead(unreadNotificationId)}>
            Mark read
          </button>
        ) : null}
      </div>
    </article>
  );
};

export const ActivityPanel = ({
  items,
  isLoading,
  canOpenLatestUnread,
  canOpenRecentTask,
  emptyLabel = 'No activity yet.',
  isShortcutHelpOpen,
  shortcutHelpButtonRef,
  onActivityItemClick,
  onCopyActivityReference,
  onMarkNotificationRead,
  onOpenLatestUnread,
  onOpenRecentTask,
  onShortcutHelpOpenChange,
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

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      onCopyActivityReference(item);
      return;
    }

    if (event.shiftKey && event.key === 'Enter' && item.notificationId !== undefined) {
      event.preventDefault();
      onMarkNotificationRead(item.notificationId);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.currentTarget.blur();
      onEscape?.();
    }
  };

  const closeShortcutHelp = (): void => {
    onShortcutHelpOpenChange(false);
    shortcutHelpButtonRef?.current?.focus({ preventScroll: true });
  };

  const handleShortcutHelpKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !isShortcutHelpOpen) {
      return;
    }

    event.preventDefault();
    closeShortcutHelp();
  };

  return (
    <aside className="chat-ui-activity-panel" onKeyDown={handleShortcutHelpKeyDown}>
      <div className="chat-ui-panel-header">
        <div>
          <p className="chat-ui-eyebrow">Activity</p>
          <strong>{sections.needsAttention.length} need attention</strong>
        </div>
        <div className="chat-ui-panel-header-actions">
          {isLoading ? <span>Loading...</span> : null}
          <button
            type="button"
            className="chat-ui-panel-action"
            onClick={onOpenLatestUnread}
            disabled={!canOpenLatestUnread}
            aria-label="Open latest unread activity"
            title="Open latest unread activity"
          >
            Unread
          </button>
          <button
            type="button"
            className="chat-ui-panel-action"
            onClick={onOpenRecentTask}
            disabled={!canOpenRecentTask}
            aria-label="Reopen recent task"
            title="Reopen recent task"
          >
            Recent
          </button>
          <button
            ref={shortcutHelpButtonRef}
            type="button"
            className="chat-ui-shortcuts-button"
            aria-label="Show keyboard shortcuts"
            aria-expanded={isShortcutHelpOpen}
            aria-controls="chat-ui-shortcuts-help"
            title="Keyboard shortcuts"
            onClick={() => onShortcutHelpOpenChange(!isShortcutHelpOpen)}
          >
            ?
          </button>
        </div>
      </div>

      {isShortcutHelpOpen ? (
        <section
          id="chat-ui-shortcuts-help"
          className="chat-ui-shortcuts-help"
          aria-label="Keyboard shortcuts"
        >
          {keyboardShortcuts.map(([keys, description]) => (
            <div key={keys}>
              <kbd>{keys}</kbd>
              <span>{description}</span>
            </div>
          ))}
        </section>
      ) : null}

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
                onCopyActivityReference,
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
                onCopyActivityReference,
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
