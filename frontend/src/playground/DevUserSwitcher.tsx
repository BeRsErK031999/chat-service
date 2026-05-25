import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';

import type { ChatUser } from '../chat-ui';

export type DevUser = ChatUser & {
  label: string;
};

export type PlaygroundAuthMode = 'dev-user-id' | 'bearer';

export const devUsers = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    displayName: 'Artem',
    label: 'Artem',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    displayName: 'Tester',
    label: 'Tester',
  },
] as const satisfies readonly DevUser[];

type DevUserSwitcherProps = {
  onStartSession: (session: {
    authMode: PlaygroundAuthMode;
    token: string;
    user: DevUser;
  }) => void;
};

export const DevUserSwitcher = ({ onStartSession }: DevUserSwitcherProps): ReactElement => {
  const [authMode, setAuthMode] = useState<PlaygroundAuthMode>('bearer');
  const [selectedUserId, setSelectedUserId] = useState<string>(devUsers[0].id);
  const [token, setToken] = useState('');
  const selectedUser = useMemo(
    () => devUsers.find((user) => user.id === selectedUserId) ?? devUsers[0],
    [selectedUserId],
  );
  const trimmedToken = token.trim();
  const canStartBearer = trimmedToken.length > 0;

  return (
    <main className="login-screen">
      <section className="login-panel">
        <p className="eyebrow">Internal testing</p>
        <h1>Chat playground</h1>

        <div className="auth-mode-tabs" role="tablist" aria-label="Playground auth mode">
          <button
            type="button"
            className={authMode === 'bearer' ? 'active' : undefined}
            onClick={() => setAuthMode('bearer')}
          >
            Bearer token
          </button>
          <button
            type="button"
            className={authMode === 'dev-user-id' ? 'active' : undefined}
            onClick={() => setAuthMode('dev-user-id')}
          >
            Dev user
          </button>
        </div>

        {authMode === 'bearer' ? (
          <div className="bearer-auth-form">
            <label>
              Display identity
              <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
                {devUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Short-lived bearer token
              <textarea
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Paste a short-lived test token"
                spellCheck={false}
              />
            </label>
            <p className="auth-hint">
              The token controls API identity. The selected user label is only for playground display.
            </p>
            <button
              type="button"
              disabled={!canStartBearer}
              onClick={() =>
                onStartSession({
                  authMode: 'bearer',
                  token: trimmedToken,
                  user: selectedUser,
                })
              }
            >
              Open playground
            </button>
          </div>
        ) : (
          <div className="user-grid">
            {devUsers.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() =>
                  onStartSession({
                    authMode: 'dev-user-id',
                    token: '',
                    user,
                  })
                }
              >
                <span>{user.label}</span>
                <small>{user.id}</small>
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  );
};
