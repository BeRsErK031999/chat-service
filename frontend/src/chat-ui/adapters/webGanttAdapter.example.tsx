import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';

import { ChatWidget } from '../ChatWidget';
import type { ChatWidgetCallbacks, ChatWidgetUser } from '../types';

type WebGanttHostUser = {
  id: string;
  displayName: string;
};

type WebGanttTask = {
  id: string;
  name: string;
};

type WebGanttHostServices = {
  chatApiBaseUrl: string;
  setChatUnreadCount: (count: number) => void;
  trackChatRoom: (roomId: string | null) => void;
  trackChatMessageSent: (roomId: string, messageId: string) => void;
  showChatAccessDenied: (message: string) => void;
  setChatRealtimeStatus: (status: 'disabled' | 'disconnected' | 'connected') => void;
};

export type WebGanttChatAdapterExampleProps = {
  currentUser: WebGanttHostUser;
  tasks: WebGanttTask[];
  host: WebGanttHostServices;
};

export const WebGanttChatAdapterExample = ({
  currentUser,
  tasks,
  host,
}: WebGanttChatAdapterExampleProps): ReactElement => {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;

  const chatUser = useMemo<ChatWidgetUser>(
    () => ({
      id: currentUser.id,
      displayName: currentUser.displayName,
    }),
    [currentUser.displayName, currentUser.id],
  );

  const callbacks = useMemo<ChatWidgetCallbacks>(
    () => ({
      onUnreadCountChange: host.setChatUnreadCount,
      onRoomChange: host.trackChatRoom,
      onMessageSent: (message) => host.trackChatMessageSent(message.roomId, message.id),
      onAccessDenied: (error) => host.showChatAccessDenied(error.message),
      onRealtimeStatusChange: host.setChatRealtimeStatus,
      onClose: () => setSelectedTaskId(null),
    }),
    [host],
  );

  return (
    <section className="web-gantt-example">
      <div className="web-gantt-example__task-list">
        {tasks.map((task) => (
          <button key={task.id} type="button" onClick={() => setSelectedTaskId(task.id)}>
            Open chat for {task.name}
          </button>
        ))}
      </div>

      {selectedTask !== null ? (
        <aside className="web-gantt-example__chat-drawer" aria-label={`${selectedTask.name} chat`}>
          <ChatWidget
            apiBaseUrl={host.chatApiBaseUrl}
            currentUser={chatUser}
            auth={{
              strategy: 'dev-user-id',
              userId: currentUser.id,
            }}
            context={{
              taskId: selectedTask.id,
              roomScope: 'internal',
              source: 'web',
            }}
            mode="embedded"
            enableRealtime
            callbacks={callbacks}
            labels={{
              title: `${selectedTask.name} chat`,
              selectRoomEmpty: 'Select a task to open its chat.',
            }}
          />
        </aside>
      ) : null}
    </section>
  );
};
