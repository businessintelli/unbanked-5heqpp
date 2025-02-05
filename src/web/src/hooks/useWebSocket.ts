import { useEffect, useCallback } from 'react'; // react v18.2.0
import { useWebSocketContext } from '../providers/WebSocketProvider';

// Enhanced error types for WebSocket operations
export interface WebSocketError {
  type: 'ConnectionError' | 'MessageError' | 'SubscriptionError';
  code: number;
  message: string;
  retryable: boolean;
  data?: unknown;
  channel?: string;
}

// Detailed connection status tracking
export interface ConnectionStatus {
  status: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'RECONNECTING';
  lastConnected: Date | null;
  reconnectAttempts: number;
  latency: number;
}

// Configuration options for useWebSocket hook
export interface UseWebSocketOptions {
  channel: string;
  onMessage?: (data: any) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: WebSocketError) => void;
  autoConnect?: boolean;
  reconnectOptions?: {
    maxAttempts: number;
    backoffFactor: number;
    maxBackoff: number;
  };
  messageQueue?: {
    enabled: boolean;
    maxSize: number;
  };
}

// Return type for useWebSocket hook
interface UseWebSocketReturn {
  connectionStatus: ConnectionStatus;
  error: WebSocketError | null;
  lastMessage: any;
  connect: () => Promise<void>;
  disconnect: () => void;
  send: (data: any) => Promise<boolean>;
  metrics: {
    messageLatency: number;
    reconnections: number;
    messagesSent: number;
    messagesReceived: number;
  };
}

/**
 * Enhanced custom hook for managing WebSocket connections and subscriptions
 * with improved error handling and monitoring
 */
export const useWebSocket = (options: UseWebSocketOptions): UseWebSocketReturn => {
  const {
    channel,
    onMessage,
    onConnect,
    onDisconnect,
    onError,
    autoConnect = true,
    reconnectOptions = {
      maxAttempts: 5,
      backoffFactor: 1.5,
      maxBackoff: 30000
    },
    messageQueue = {
      enabled: true,
      maxSize: 100
    }
  } = options;

  const wsContext = useWebSocketContext();
  const messageQueueRef = useRef<any[]>([]);
  const metricsRef = useRef({
    messageLatency: 0,
    reconnections: 0,
    messagesSent: 0,
    messagesReceived: 0
  });

  // Initialize connection status
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    status: 'DISCONNECTED',
    lastConnected: null,
    reconnectAttempts: 0,
    latency: 0
  });

  const [lastMessage, setLastMessage] = useState<any>(null);
  const [error, setError] = useState<WebSocketError | null>(null);

  // Memoized message handler with type validation
  const handleMessage = useCallback((data: any) => {
    const startTime = performance.now();
    
    try {
      setLastMessage(data);
      metricsRef.current.messagesReceived++;
      metricsRef.current.messageLatency = performance.now() - startTime;
      
      if (onMessage) {
        onMessage(data);
      }

      // Process queued messages if enabled
      if (messageQueue.enabled && messageQueueRef.current.length > 0) {
        const queuedMessage = messageQueueRef.current.shift();
        if (queuedMessage) {
          wsContext.client?.send(queuedMessage);
        }
      }
    } catch (err) {
      const wsError: WebSocketError = {
        type: 'MessageError',
        code: 1003,
        message: 'Failed to process message',
        retryable: false,
        data: err
      };
      setError(wsError);
      onError?.(wsError);
    }
  }, [onMessage, onError, messageQueue.enabled]);

  // Enhanced connect function with backoff strategy
  const connect = useCallback(async () => {
    try {
      await wsContext.connect();
      setConnectionStatus(prev => ({
        ...prev,
        status: 'CONNECTED',
        lastConnected: new Date(),
        reconnectAttempts: 0
      }));
      onConnect?.();
    } catch (err) {
      const wsError: WebSocketError = {
        type: 'ConnectionError',
        code: 1000,
        message: 'Failed to establish connection',
        retryable: true,
        data: err
      };
      setError(wsError);
      onError?.(wsError);

      // Implement backoff strategy
      if (connectionStatus.reconnectAttempts < reconnectOptions.maxAttempts) {
        const backoffTime = Math.min(
          reconnectOptions.backoffFactor * Math.pow(2, connectionStatus.reconnectAttempts),
          reconnectOptions.maxBackoff
        );
        
        setTimeout(() => {
          setConnectionStatus(prev => ({
            ...prev,
            status: 'RECONNECTING',
            reconnectAttempts: prev.reconnectAttempts + 1
          }));
          metricsRef.current.reconnections++;
          connect();
        }, backoffTime);
      }
    }
  }, [wsContext, onConnect, onError, reconnectOptions, connectionStatus.reconnectAttempts]);

  // Enhanced disconnect function with cleanup
  const disconnect = useCallback(() => {
    wsContext.disconnect();
    setConnectionStatus(prev => ({
      ...prev,
      status: 'DISCONNECTED',
      lastConnected: null
    }));
    messageQueueRef.current = [];
    onDisconnect?.();
  }, [wsContext, onDisconnect]);

  // Enhanced send function with queue support
  const send = useCallback(async (data: any): Promise<boolean> => {
    try {
      if (wsContext.client && wsContext.isConnected) {
        await wsContext.client.send({
          type: 'message',
          channel,
          data,
          timestamp: Date.now(),
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        });
        metricsRef.current.messagesSent++;
        return true;
      } else if (messageQueue.enabled) {
        if (messageQueueRef.current.length < messageQueue.maxSize) {
          messageQueueRef.current.push(data);
          return true;
        }
        throw new Error('Message queue full');
      }
      return false;
    } catch (err) {
      const wsError: WebSocketError = {
        type: 'MessageError',
        code: 1001,
        message: 'Failed to send message',
        retryable: true,
        data: err
      };
      setError(wsError);
      onError?.(wsError);
      return false;
    }
  }, [wsContext, channel, messageQueue.enabled, messageQueue.maxSize, onError]);

  // Set up subscription with error boundary
  useEffect(() => {
    if (channel && wsContext.isConnected) {
      wsContext.subscribe(channel, handleMessage);
    }
    
    return () => {
      if (channel) {
        wsContext.unsubscribe(channel);
      }
    };
  }, [wsContext, channel, handleMessage]);

  // Handle auto-connection
  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    
    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    connectionStatus,
    error,
    lastMessage,
    connect,
    disconnect,
    send,
    metrics: metricsRef.current
  };
};

export default useWebSocket;