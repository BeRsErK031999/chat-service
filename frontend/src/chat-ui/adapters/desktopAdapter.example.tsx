import { useMemo } from 'react';
import type { ReactElement } from 'react';

import { ChatWidget } from '../ChatWidget';
import type {
  ChatWidgetCallbacks,
  ChatWidgetMode,
  ChatWidgetRoomScope,
  ChatWidgetUser,
} from '../types';

type DesktopHostUser = {
  id: string;
  fullName: string;
};

type DesktopHostTask = {
  id: string;
  title: string;
  chatRoomScope: ChatWidgetRoomScope;
};

type DesktopHostShell = {
  chatApiBaseUrl: string;
  setUnreadBadge: (count: number) => void;
  rememberActiveRoom: (roomId: string | null) => void;
  recordMessageSent: (roomId: string, messageId: string) => void;
  showAccessDenied: (message: string) => void;
  setRealtimeIndicator: (status: 'disabled' | 'disconnected' | 'connected') => void;
  closeChatPanel: () => void;
};

export type DesktopChatAdapterExampleProps = {
  hostUser: DesktopHostUser;
  activeTask: DesktopHostTask;
  shell: DesktopHostShell;
  mode?: Extract<ChatWidgetMode, 'embedded' | 'compact'>;
};

export const DesktopChatAdapterExample = ({
  hostUser,
  activeTask,
  shell,
  mode = 'embedded',
}: DesktopChatAdapterExampleProps): ReactElement => {
  const currentUser = useMemo<ChatWidgetUser>(
    () => ({
      id: hostUser.id,
      displayName: hostUser.fullName,
    }),
    [hostUser.fullName, hostUser.id],
  );

  const callbacks = useMemo<ChatWidgetCallbacks>(
    () => ({
      onUnreadCountChange: shell.setUnreadBadge,
      onRoomChange: shell.rememberActiveRoom,
      onMessageSent: (message) => shell.recordMessageSent(message.roomId, message.id),
      onAccessDenied: (error) => shell.showAccessDenied(error.message),
      onRealtimeStatusChange: shell.setRealtimeIndicator,
      onClose: shell.closeChatPanel,
    }),
    [shell],
  );

  return (
    <ChatWidget
      apiBaseUrl={shell.chatApiBaseUrl}
      currentUser={currentUser}
      auth={{
        strategy: 'dev-user-id',
        userId: hostUser.id,
      }}
      context={{
        taskId: activeTask.id,
        roomScope: activeTask.chatRoomScope,
        source: 'desktop',
      }}
      mode={mode}
      enableRealtime
      callbacks={callbacks}
      labels={{
        title: `${activeTask.title} chat`,
        selectRoomEmpty: 'No task chat is selected.',
      }}
    />
  );
};
