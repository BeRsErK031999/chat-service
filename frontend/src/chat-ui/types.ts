export type ChatWidgetUser = {
  id: string;
  displayName: string;
};

export type ChatUser = ChatWidgetUser;

export type ChatWidgetMode = 'full' | 'embedded' | 'compact';

export type ChatWidgetContext = {
  taskId?: string;
  roomId?: string;
  roomScope?: 'internal' | 'manager' | 'customer' | 'system-events';
  source?: 'playground' | 'desktop' | 'web';
};

export type ChatWidgetRoomScope = NonNullable<ChatWidgetContext['roomScope']>;

export type ChatWidgetAuth =
  | {
      strategy: 'dev-user-id';
      userId: string;
    }
  | {
      strategy: 'cookie';
    }
  | {
      strategy: 'bearer';
      token?: string;
    };

export type RoomType = 'TASK' | 'DIRECT' | 'GROUP' | 'SYSTEM';

export type MessageType = 'TEXT' | 'SYSTEM_EVENT';

export type Message = {
  id: string;
  roomId: string;
  senderUserId: string | null;
  type: MessageType;
  body: string | null;
  eventType: string | null;
  eventPayload: unknown;
  sourceEventId: string | null;
  sequence: number;
  createdAt: string;
  updatedAt: string;
};

export type RoomListItem = {
  id: string;
  type: RoomType;
  name: string | null;
  description: string | null;
  taskId: string | null;
  projectId: string | null;
  taskRoomKind: string | null;
  lastMessageAt: string | null;
  lastMessage: Message | null;
  unreadCount: number;
};

export type Notification = {
  id: string;
  userId: string;
  roomId: string | null;
  messageId: string | null;
  type: string;
  title: string;
  body: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH';
  deliveryState: 'PENDING' | 'DELIVERED' | 'READ' | 'FAILED' | 'SUPPRESSED';
  readAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RealtimeStatus = 'disabled' | 'disconnected' | 'connected';

export type TaskRoomLookupResult = {
  roomId: string;
  taskId: string;
  roomScope: ChatWidgetRoomScope;
  roomName: string;
};

export type ChatWidgetCallbacks = {
  onUnreadCountChange?: (count: number) => void;
  onRoomChange?: (roomId: string | null) => void;
  onMessageSent?: (message: Message) => void;
  onNotificationClick?: (notification: Notification) => void;
  onAuthError?: (error: Error) => void;
  onAccessDenied?: (error: Error) => void;
  onRealtimeStatusChange?: (status: RealtimeStatus) => void;
  onClose?: () => void;
};

export type ChatWidgetLabels = {
  title?: string;
  roomsEmpty?: string;
  messagesEmpty?: string;
  notificationsEmpty?: string;
  selectRoomEmpty?: string;
};

export type ChatWidgetProps = {
  apiBaseUrl: string;
  currentUser: ChatWidgetUser;
  auth?: ChatWidgetAuth;
  context?: ChatWidgetContext;
  initialRoomId?: string;
  mode?: ChatWidgetMode;
  enableRealtime?: boolean;
  className?: string;
  callbacks?: ChatWidgetCallbacks;
  labels?: ChatWidgetLabels;
};
