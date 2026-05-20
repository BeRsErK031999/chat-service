import type { ReactElement } from 'react';

import type { RealtimeStatus as RealtimeStatusValue } from '../types';

type RealtimeStatusProps = {
  status: RealtimeStatusValue;
};

export const RealtimeStatus = ({ status }: RealtimeStatusProps): ReactElement => {
  if (status === 'disabled') {
    return <span className="chat-ui-status">Realtime disabled, using polling fallback</span>;
  }

  return (
    <span className="chat-ui-status">
      {status === 'connected'
        ? 'Realtime connected'
        : 'Realtime disconnected, using polling fallback'}
    </span>
  );
};
