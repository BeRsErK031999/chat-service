import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';

import { ChatWidget } from '../chat-ui';
import type { ChatWidgetAuth, RealtimeStatus } from '../chat-ui';
import { devUsers, DevUserSwitcher } from './DevUserSwitcher';
import type { DevUser, PlaygroundAuthMode } from './DevUserSwitcher';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/chat/api';

type PlaygroundSession = {
  authMode: PlaygroundAuthMode;
  token: string;
  user: DevUser;
};

const getAuthErrorMessage = (authMode: PlaygroundAuthMode, error: Error): string => {
  if (authMode === 'dev-user-id') {
    return `${error.message} Dev user mode requires CHAT_ALLOW_DEV_USER_ID=true on the backend.`;
  }

  return `${error.message} Check that the bearer token is present, unexpired, and signed for the selected staging backend.`;
};

export const PlaygroundApp = (): ReactElement => {
  const [session, setSession] = useState<PlaygroundSession | null>(null);
  const [openTaskRoom, setOpenTaskRoom] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('disconnected');

  const auth = useMemo<ChatWidgetAuth | undefined>(() => {
    if (session === null) {
      return undefined;
    }

    if (session.authMode === 'dev-user-id') {
      return {
        strategy: 'dev-user-id',
        userId: session.user.id,
      };
    }

    return {
      strategy: 'bearer',
      token: session.token,
    };
  }, [session]);

  if (session === null || auth === undefined) {
    return (
      <DevUserSwitcher
        onStartSession={(nextSession) => {
          setAuthNotice(null);
          setRealtimeStatus('disconnected');
          setOpenTaskRoom(false);
          setSession(nextSession);
        }}
      />
    );
  }

  const selectedUser = session.user;
  const selectedUserLabel =
    devUsers.find((user) => user.id === selectedUser.id)?.label ?? selectedUser.displayName;

  return (
    <div className="playground-shell">
      {authNotice !== null ? <div className="playground-auth-notice">{authNotice}</div> : null}
      <div className="playground-switcher">
        <span>
          {selectedUserLabel} / {session.authMode === 'bearer' ? 'Bearer' : 'Dev user'}
        </span>
        {session.authMode === 'bearer' && realtimeStatus === 'disconnected' ? (
          <span className="playground-switcher-warning">Check token or SSE auth</span>
        ) : null}
        <button type="button" onClick={() => setOpenTaskRoom((current) => !current)}>
          {openTaskRoom ? 'Open default' : 'Open task-123/internal'}
        </button>
        <button type="button" onClick={() => setSession(null)}>
          Switch
        </button>
      </div>
      <ChatWidget
        apiBaseUrl={apiBaseUrl}
        currentUser={selectedUser}
        auth={auth}
        mode="full"
        callbacks={{
          onAuthError: (error) => setAuthNotice(getAuthErrorMessage(session.authMode, error)),
          onRealtimeStatusChange: setRealtimeStatus,
        }}
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
