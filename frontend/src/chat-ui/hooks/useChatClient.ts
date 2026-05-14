import { useMemo } from 'react';

import { createChatApiClient } from '../api';
import type { ChatApiClient } from '../api';
import type { ChatWidgetAuth } from '../types';

export const useChatClient = (apiBaseUrl: string, auth: ChatWidgetAuth): ChatApiClient =>
  useMemo(
    () =>
      createChatApiClient({
        apiBaseUrl,
        auth,
      }),
    [apiBaseUrl, auth],
  );
