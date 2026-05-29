import type { ChatActivityItem } from '../types.js';

export type ActivityItemKeyboardAction =
  | { type: 'focus-relative'; direction: 1 | -1 }
  | { type: 'copy-reference' }
  | { type: 'mark-read'; notificationId: string }
  | { type: 'restore-focus' }
  | { type: 'ignore' };

export type ActivityItemKeyboardInput = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
};

export const getRelativeActivityItemId = (
  itemIds: readonly string[],
  currentItemId: string,
  direction: 1 | -1,
): string | null => {
  if (itemIds.length === 0) {
    return null;
  }

  const selectedIndex = itemIds.findIndex((itemId) => itemId === currentItemId);
  const fallbackIndex = direction === 1 ? 0 : itemIds.length - 1;
  const nextIndex =
    selectedIndex === -1
      ? fallbackIndex
      : (selectedIndex + direction + itemIds.length) % itemIds.length;

  return itemIds[nextIndex] ?? null;
};

export const getActivityItemKeyboardAction = (
  input: ActivityItemKeyboardInput,
  item: ChatActivityItem,
): ActivityItemKeyboardAction => {
  if (input.key === 'ArrowDown') {
    return { type: 'focus-relative', direction: 1 };
  }

  if (input.key === 'ArrowUp') {
    return { type: 'focus-relative', direction: -1 };
  }

  if ((input.ctrlKey === true || input.metaKey === true) && input.key.toLowerCase() === 'c') {
    return { type: 'copy-reference' };
  }

  if (input.shiftKey === true && input.key === 'Enter' && item.notificationId !== undefined) {
    return { type: 'mark-read', notificationId: item.notificationId };
  }

  if (input.key === 'Escape') {
    return { type: 'restore-focus' };
  }

  return { type: 'ignore' };
};
