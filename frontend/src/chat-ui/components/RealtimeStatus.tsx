import type { ReactElement } from 'react';

import type { RealtimeStatus as RealtimeStatusValue } from '../types';

type RealtimeStatusProps = {
  status: RealtimeStatusValue;
};

export const RealtimeStatus = ({ status }: RealtimeStatusProps): ReactElement => {
  if (status === 'disabled') {
    return <span>Realtime disabled, using polling fallback</span>;
  }

  return (
    <span>
      {status === 'connected'
        ? 'Realtime connected'
        : 'Realtime disconnected, using polling fallback'}
    </span>
  );
};
