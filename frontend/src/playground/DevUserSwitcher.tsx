import type { ReactElement } from 'react';

import type { ChatUser } from '../chat-ui';

export type DevUser = ChatUser & {
  label: string;
};

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
  onSelectUser: (user: DevUser) => void;
};

export const DevUserSwitcher = ({ onSelectUser }: DevUserSwitcherProps): ReactElement => (
  <main className="login-screen">
    <section className="login-panel">
      <p className="eyebrow">Internal testing</p>
      <h1>Chat playground</h1>
      <div className="user-grid">
        {devUsers.map((user) => (
          <button key={user.id} type="button" onClick={() => onSelectUser(user)}>
            <span>{user.label}</span>
            <small>{user.id}</small>
          </button>
        ))}
      </div>
    </section>
  </main>
);
