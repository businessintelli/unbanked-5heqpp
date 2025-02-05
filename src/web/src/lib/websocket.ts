import { EventEmitter } from 'events'; // events v3.3.0
import { API_CONFIG } from '../config/api';

// WebSocket configuration interface
export interface WebSocketOptions {
  url?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
  messageTimeout?: number;
  connectionTimeout?: number;
}

// WebSocket message interface with strict typing
export interface WebSocketMessage<T = unknown> {
  type: string;
  channel: string;
  data: T;
  timestamp: number;
  id: string;
}

// Custom error type for WebSocket operations
export interface WebSocketError {
  code: string;
  message: string;
  details: Record<string, unknown>;
  timestamp: number;
}

// Default configuration values
const DEFAULT_OPTIONS: Required<WebSocketOptions> = {
  url: `${API_CONFIG.baseUrl.replace('http', 'ws')}/ws`,
  reconnectInterval: 1000,
  maxReconnectAttempts: 5,
  heartbeatInterval: 30000,
  messageTimeout: 5000,
  connectionTimeout: 10000,
};

export class WebSocketClient {
  private socket: WebSocket | null = null;
  private readonly eventEmitter = new EventEmitter();
  private readonly subscriptions = new Map<string, Set<Function>>();
  private reconnectAttempts = 0;
  private isConnecting = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private readonly messageTimeouts = new Map<string, number>();
  private lastMessageTimestamp = 0;
  private forceDisconnected = false;
  private readonly options: Required<WebSocketOptions>;

  constructor(options: WebSocketOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.validateOptions();
  }

  private validateOptions(): void {
    if (this.options.reconnectInterval < 100) {
      throw new Error('Reconnect interval must be at least 100ms');
    }
    if (this.options.heartbeatInterval < 1000) {
      throw new Error('Heartbeat interval must be at least 1000ms');
    }
  }

  public async connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN || this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    this.forceDisconnected = false;

    return new Promise<void>((resolve, reject) => {
      const connectionTimeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
        this.cleanup();
      }, this.options.connectionTimeout);

      try {
        this.socket = new WebSocket(this.options.url);
        this.setupEventListeners(resolve, connectionTimeout);
      } catch (error) {
        clearTimeout(connectionTimeout);
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  private setupEventListeners(resolve: Function, connectionTimeout: NodeJS.Timeout): void {
    if (!this.socket) return;

    this.socket.onopen = () => {
      clearTimeout(connectionTimeout);
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.resubscribeAll();
      this.eventEmitter.emit('connected');
      resolve();
    };

    this.socket.onclose = (event) => {
      this.handleClose(event);
    };

    this.socket.onerror = (error) => {
      this.eventEmitter.emit('error', this.createError('CONNECTION_ERROR', 'WebSocket error occurred', { error }));
    };

    this.socket.onmessage = (event) => {
      this.handleMessage(event);
    };
  }

  private handleClose(event: CloseEvent): void {
    this.cleanup();
    
    if (!this.forceDisconnected && this.reconnectAttempts < this.options.maxReconnectAttempts) {
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      this.reconnectAttempts++;
      
      setTimeout(() => {
        this.connect().catch(() => {
          this.eventEmitter.emit('error', this.createError('RECONNECT_FAILED', 'Failed to reconnect'));
        });
      }, delay);
    }

    this.eventEmitter.emit('disconnected', event);
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      this.lastMessageTimestamp = Date.now();
      this.messageTimeouts.delete(message.id);
      
      if (message.type === 'heartbeat') {
        this.socket?.send(JSON.stringify({ type: 'heartbeat_ack', timestamp: Date.now() }));
        return;
      }

      const subscribers = this.subscriptions.get(message.channel);
      subscribers?.forEach(callback => callback(message.data));
      
      this.eventEmitter.emit('message', message);
    } catch (error) {
      this.eventEmitter.emit('error', this.createError('MESSAGE_PARSE_ERROR', 'Failed to parse message', { error }));
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (Date.now() - this.lastMessageTimestamp > this.options.heartbeatInterval * 2) {
        this.disconnect(true);
        this.connect().catch(() => {
          this.eventEmitter.emit('error', this.createError('HEARTBEAT_FAILED', 'Heartbeat check failed'));
        });
        return;
      }

      this.send({ type: 'heartbeat', channel: 'system', data: null, timestamp: Date.now(), id: this.generateId() })
        .catch(() => {
          this.eventEmitter.emit('error', this.createError('HEARTBEAT_SEND_FAILED', 'Failed to send heartbeat'));
        });
    }, this.options.heartbeatInterval);
  }

  public async subscribe<T>(channel: string, callback: (data: T) => void): Promise<void> {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    
    this.subscriptions.get(channel)?.add(callback);

    if (this.socket?.readyState === WebSocket.OPEN) {
      await this.send({
        type: 'subscribe',
        channel,
        data: null,
        timestamp: Date.now(),
        id: this.generateId()
      });
    }
  }

  public async unsubscribe(channel: string, callback?: Function): Promise<void> {
    if (callback) {
      this.subscriptions.get(channel)?.delete(callback);
    } else {
      this.subscriptions.delete(channel);
    }

    if (this.socket?.readyState === WebSocket.OPEN) {
      await this.send({
        type: 'unsubscribe',
        channel,
        data: null,
        timestamp: Date.now(),
        id: this.generateId()
      });
    }
  }

  public async send(message: WebSocketMessage): Promise<boolean> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.messageTimeouts.delete(message.id);
        reject(new Error('Message timeout'));
      }, this.options.messageTimeout);

      this.messageTimeouts.set(message.id, timeoutId);

      try {
        this.socket.send(JSON.stringify(message));
        resolve(true);
      } catch (error) {
        clearTimeout(timeoutId);
        this.messageTimeouts.delete(message.id);
        reject(error);
      }
    });
  }

  public disconnect(force: boolean = false): void {
    this.forceDisconnected = force;
    this.cleanup();
    
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.close(1000, 'Client disconnected');
    }
  }

  private cleanup(): void {
    this.isConnecting = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    this.messageTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
    this.messageTimeouts.clear();
    
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.onmessage = null;
      this.socket.onopen = null;
      this.socket = null;
    }
  }

  private async resubscribeAll(): Promise<void> {
    for (const channel of this.subscriptions.keys()) {
      await this.send({
        type: 'subscribe',
        channel,
        data: null,
        timestamp: Date.now(),
        id: this.generateId()
      });
    }
  }

  private createError(code: string, message: string, details: Record<string, unknown> = {}): WebSocketError {
    return {
      code,
      message,
      details,
      timestamp: Date.now()
    };
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  public on(event: string, callback: Function): void {
    this.eventEmitter.on(event, callback);
  }

  public off(event: string, callback: Function): void {
    this.eventEmitter.off(event, callback);
  }
}