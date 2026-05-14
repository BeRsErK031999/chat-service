import { useState } from 'react';
import type { ReactElement } from 'react';

import { ChatWidget } from '../chat-ui';
import { DevUserSwitcher } from './DevUserSwitcher';
import type { DevUser } from './DevUserSwitcher';
import './playground.css';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/chat/api';

export const PlaygroundApp = (): ReactElement => {
  const [selectedUser, setSelectedUser] = useState<DevUser | null>(null);
  const [openTaskRoom, setOpenTaskRoom] = useState(false);

  if (selectedUser === null) {
    return <DevUserSwitcher onSelectUser={setSelectedUser} />;
  }

  return (
    <div className="playground-shell">
      <div className="playground-switcher">
        <span>{selectedUser.label}</span>
        <button type="button" onClick={() => setOpenTaskRoom((current) => !current)}>
          {openTaskRoom ? 'Open default' : 'Open task-123/internal'}
        </button>
        <button type="button" onClick={() => setSelectedUser(null)}>
          Switch
        </button>
      </div>
      <ChatWidget
        apiBaseUrl={apiBaseUrl}
        currentUser={selectedUser}
        mode="full"
        {...(openTaskRoom
          ? {
              context: {
                taskId: 'task-123',
                roomScope: 'internal',
                source: 'playground',
              },
            }
          : {})}
      />
    </div>
  );
};
