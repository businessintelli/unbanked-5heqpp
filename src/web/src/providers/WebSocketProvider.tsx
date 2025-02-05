import { createContext, useContext, useEffect, useCallback, useMemo, ReactNode } from 'react'; // react v18.2.0
import * as monitoring from '@sentry/browser'; // @sentry/browser v7.0.0
import { WebSocketClient, WebSocketMessage, WebSocketError } from '../lib/websocket';
import { API_CONFIG } from '../config/api';

// Connection status enum for type-safe status tracking
enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting'
}

// Enhanced WebSocket context type with comprehensive state and methods
interface WebSocketContextValue {
  client: WebSocketClient | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: WebSocketError | null;
  lastReconnectAttempt: Date | null;
  reconnectAttempts: number;
  connect: () => Promise<void>;
  disconnect: () => void;
  subscribe: <T>(channel: string, callback: (data: T) => void) => void;
  unsubscribe: (channel: string) => void;
  getConnectionStatus: () => ConnectionStatus;
}

// Props interface for the WebSocket provider
interface WebSocketProviderProps {
  children: ReactNode;
  autoConnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectInterval?: number;
}

// Create context with type safety
const WebSocketContext = createContext<WebSocketContextValue | null>(null);

// Enhanced WebSocket provider component
export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({
  children,
  autoConnect = true,
  maxReconnectAttempts = 5,
  reconnectInterval = 1000
}) => {
  // Initialize WebSocket client with configuration
  const client = useMemo(() => new WebSocketClient({
    url: `${API_CONFIG.baseUrl.replace('http', 'ws')}/ws`,
    maxReconnectAttempts,
    reconnectInterval,
    heartbeatInterval: 30000,
    messageTimeout: 5000,
    connectionTimeout: 10000
  }), [maxReconnectAttempts, reconnectInterval]);

  // State management
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<WebSocketError | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [lastReconnectAttempt, setLastReconnectAttempt] = useState<Date | null>(null);

  // Subscription management
  const subscriptions = useRef(new Map<string, Set<Function>>());

  // Enhanced connection handler with monitoring
  const connect = useCallback(async () => {
    if (isConnected || isConnecting) return;

    try {
      setIsConnecting(true);
      monitoring.addBreadcrumb({
        category: 'websocket',
        message: 'Attempting WebSocket connection',
        level: 'info'
      });

      await client.connect();
      setIsConnected(true);
      setError(null);
      setReconnectAttempts(0);

      monitoring.captureMessage('WebSocket connected successfully', 'info');
    } catch (err) {
      const wsError = err as WebSocketError;
      setError(wsError);
      setReconnectAttempts((prev) => prev + 1);
      setLastReconnectAttempt(new Date());

      monitoring.captureException(err, {
        tags: {
          reconnectAttempts: reconnectAttempts.toString(),
          errorCode: wsError.code
        }
      });
    } finally {
      setIsConnecting(false);
    }
  }, [client, isConnected, isConnecting, reconnectAttempts]);

  // Enhanced disconnect handler with cleanup
  const disconnect = useCallback(() => {
    client.disconnect(true);
    setIsConnected(false);
    setIsConnecting(false);
    setError(null);
    setReconnectAttempts(0);
    setLastReconnectAttempt(null);
    subscriptions.current.clear();

    monitoring.addBreadcrumb({
      category: 'websocket',
      message: 'WebSocket disconnected',
      level: 'info'
    });
  }, [client]);

  // Type-safe subscription handler
  const subscribe = useCallback(<T,>(channel: string, callback: (data: T) => void) => {
    if (!subscriptions.current.has(channel)) {
      subscriptions.current.set(channel, new Set());
    }
    subscriptions.current.get(channel)?.add(callback);

    if (isConnected) {
      client.subscribe<T>(channel, callback).catch((err) => {
        monitoring.captureException(err, {
          tags: { channel, action: 'subscribe' }
        });
      });
    }
  }, [client, isConnected]);

  // Type-safe unsubscription handler
  const unsubscribe = useCallback((channel: string) => {
    const callbacks = subscriptions.current.get(channel);
    if (!callbacks) return;

    callbacks.forEach((callback) => {
      client.unsubscribe(channel, callback).catch((err) => {
        monitoring.captureException(err, {
          tags: { channel, action: 'unsubscribe' }
        });
      });
    });

    subscriptions.current.delete(channel);
  }, [client]);

  // Connection status getter
  const getConnectionStatus = useCallback((): ConnectionStatus => {
    if (isConnected) return ConnectionStatus.CONNECTED;
    if (isConnecting && reconnectAttempts > 0) return ConnectionStatus.RECONNECTING;
    if (isConnecting) return ConnectionStatus.CONNECTING;
    return ConnectionStatus.DISCONNECTED;
  }, [isConnected, isConnecting, reconnectAttempts]);

  // Event listeners setup
  useEffect(() => {
    client.on('error', (wsError: WebSocketError) => {
      setError(wsError);
      monitoring.captureException(new Error(wsError.message), {
        tags: { errorCode: wsError.code }
      });
    });

    client.on('disconnected', () => {
      setIsConnected(false);
      monitoring.addBreadcrumb({
        category: 'websocket',
        message: 'WebSocket connection lost',
        level: 'warning'
      });
    });

    return () => {
      client.off('error', () => {});
      client.off('disconnected', () => {});
      disconnect();
    };
  }, [client, disconnect]);

  // Auto-connect handling
  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  // Context value memoization
  const contextValue = useMemo<WebSocketContextValue>(() => ({
    client,
    isConnected,
    isConnecting,
    error,
    lastReconnectAttempt,
    reconnectAttempts,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    getConnectionStatus
  }), [
    client,
    isConnected,
    isConnecting,
    error,
    lastReconnectAttempt,
    reconnectAttempts,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    getConnectionStatus
  ]);

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
};

// Enhanced hook for accessing WebSocket context with type safety
export const useWebSocketContext = (): WebSocketContextValue => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
};