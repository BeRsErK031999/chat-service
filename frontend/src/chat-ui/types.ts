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

export type LocalMessage = Message & {
  clientState: 'pending' | 'error';
  idempotencyKey: string;
};

export type ChatMessage = Message | LocalMessage;

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

export type ChatWidgetNavigationSource = 'notification' | 'task' | 'activity';

export type ChatWidgetNavigationTarget = {
  id?: string;
  roomId?: string;
  messageId?: string;
  taskId?: string;
  source?: ChatWidgetNavigationSource;
};

export type NormalizedChatWidgetNavigationTarget = {
  id: string;
  roomId?: string;
  messageId?: string;
  taskId?: string;
  source?: ChatWidgetNavigationSource;
};

export type ChatActivityKind = 'notification' | 'unread-room' | 'recent-room';

export type ChatActivityAttentionState = 'attention-needed' | 'recent' | 'read';

export type ChatActivityItem = {
  id: string;
  kind: ChatActivityKind;
  attentionState: ChatActivityAttentionState;
  target: NormalizedChatWidgetNavigationTarget;
  roomId?: string;
  messageId?: string;
  taskId?: string;
  title: string;
  summary?: string;
  occurredAt: string;
  unreadCount?: number;
  priority?: Notification['priority'];
};

export type RealtimeStatus = 'disabled' | 'connecting' | 'disconnected' | 'connected';

export type ChatRealtimeDiagnosticKind =
  | 'connect_start'
  | 'connected'
  | 'disconnected'
  | 'cleanup'
  | 'event_received'
  | 'duplicate_event'
  | 'duplicate_connection_prevented'
  | 'parse_error'
  | 'reconnect_requested'
  | 'reconnect_succeeded'
  | 'reconnect_failed'
  | 'room_switched'
  | 'polling_refresh';

export type ChatRealtimeDiagnostic = {
  kind: ChatRealtimeDiagnosticKind;
  status: RealtimeStatus;
  timestamp: string;
  eventName?: string;
  selectedRoomId?: string | null;
  activeEventSourceCount?: number;
  reconnectAttemptCount?: number;
  reconnectSuccessCount?: number;
  reconnectFailureCount?: number;
  cleanupCount?: number;
  duplicateConnectionPreventionCount?: number;
  roomSwitchCount?: number;
  lastConnectedAt?: string;
  lastDisconnectedAt?: string;
  lastReconnectReason?: 'online' | 'pageshow' | 'eventsource-error';
  roomCount?: number;
  unreadCount?: number;
};

export type PresenceStatus = 'online' | 'offline';

export type PresenceState = {
  status: PresenceStatus;
  lastSeenAt: string;
};

export type TaskRoomLookupResult = {
  roomId: string;
  taskId: string;
  roomScope: ChatWidgetRoomScope;
  roomName: string;
};

export type ChatWidgetCallbacks = {
  onUnreadCountChange?: (count: number) => void;
  onRoomChange?: (roomId: string | null) => void;
  onNavigationTargetChange?: (target: NormalizedChatWidgetNavigationTarget | null) => void;
  onActivityItemsChange?: (items: ChatActivityItem[]) => void;
  onMessageSent?: (message: Message) => void;
  onTaskOpen?: (taskId: string) => void;
  onTaskReferenceCopy?: (taskReference: string) => void;
  onNotificationClick?: (notification: Notification) => void;
  onNotificationReceived?: (notification: Notification) => void;
  onAuthError?: (error: Error) => void;
  onAccessDenied?: (error: Error) => void;
  onRealtimeStatusChange?: (status: RealtimeStatus) => void;
  onRealtimeDiagnostic?: (diagnostic: ChatRealtimeDiagnostic) => void;
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
  navigationTarget?: ChatWidgetNavigationTarget;
  mode?: ChatWidgetMode;
  enableRealtime?: boolean;
  className?: string;
  callbacks?: ChatWidgetCallbacks;
  labels?: ChatWidgetLabels;
};
