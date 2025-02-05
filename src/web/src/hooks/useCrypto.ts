import { useState, useEffect, useCallback, useRef } from 'react'; // v18.2.0
import { api } from '../lib/api';
import useWebSocket from './useWebSocket';
import * as CryptoTypes from '../types/crypto';

// Enhanced state interface for crypto operations
interface CryptoHookState {
  wallets: CryptoTypes.CryptoWallet[];
  transactions: CryptoTypes.CryptoTransaction[];
  pendingTransactions: CryptoTypes.CryptoTransaction[];
  prices: CryptoTypes.PriceData[];
  isLoading: boolean;
  error: WebSocketError | null;
  metrics: {
    lastUpdate: Date;
    priceLatency: number;
    transactionCount: number;
  };
}

// Queue for managing pending transactions
interface TransactionQueue {
  items: CryptoTypes.ExchangeRequest[];
  processing: boolean;
}

/**
 * Enhanced custom hook for managing cryptocurrency operations
 * with real-time updates and comprehensive error handling
 */
export const useCrypto = () => {
  // State initialization
  const [state, setState] = useState<CryptoHookState>({
    wallets: [],
    transactions: [],
    pendingTransactions: [],
    prices: [],
    isLoading: true,
    error: null,
    metrics: {
      lastUpdate: new Date(),
      priceLatency: 0,
      transactionCount: 0
    }
  });

  // Transaction queue management
  const transactionQueue = useRef<TransactionQueue>({
    items: [],
    processing: false
  });

  // Price update throttling
  const priceUpdateTimeout = useRef<NodeJS.Timeout | null>(null);
  const lastPriceUpdate = useRef<number>(Date.now());

  // WebSocket connection for real-time updates
  const { connectionStatus, lastMessage, error: wsError, send } = useWebSocket({
    channel: 'crypto',
    onMessage: handleWebSocketMessage,
    onError: handleWebSocketError,
    reconnectOptions: {
      maxAttempts: 5,
      backoffFactor: 1.5,
      maxBackoff: 30000
    }
  });

  /**
   * Handles incoming WebSocket messages with type validation
   */
  function handleWebSocketMessage(message: any) {
    try {
      switch (message.type) {
        case 'PRICE_UPDATE':
          handlePriceUpdate(message.data);
          break;
        case 'WALLET_UPDATE':
          handleWalletUpdate(message.data);
          break;
        case 'TRANSACTION_UPDATE':
          handleTransactionUpdate(message.data);
          break;
      }
    } catch (error) {
      setState(prev => ({ ...prev, error: error as WebSocketError }));
    }
  }

  /**
   * Handles WebSocket errors with appropriate state updates
   */
  function handleWebSocketError(error: WebSocketError) {
    setState(prev => ({ ...prev, error }));
  }

  /**
   * Throttled price update handler
   */
  const handlePriceUpdate = useCallback((priceData: CryptoTypes.PriceData[]) => {
    const now = Date.now();
    if (now - lastPriceUpdate.current < 1000) {
      if (priceUpdateTimeout.current) {
        clearTimeout(priceUpdateTimeout.current);
      }
      priceUpdateTimeout.current = setTimeout(() => {
        handlePriceUpdate(priceData);
      }, 1000);
      return;
    }

    lastPriceUpdate.current = now;
    setState(prev => ({
      ...prev,
      prices: priceData,
      metrics: {
        ...prev.metrics,
        lastUpdate: new Date(),
        priceLatency: Date.now() - now
      }
    }));
  }, []);

  /**
   * Handles wallet updates with balance reconciliation
   */
  const handleWalletUpdate = useCallback((wallet: CryptoTypes.CryptoWallet) => {
    setState(prev => ({
      ...prev,
      wallets: prev.wallets.map(w => 
        w.id === wallet.id ? { ...w, ...wallet } : w
      )
    }));
  }, []);

  /**
   * Handles transaction updates with status management
   */
  const handleTransactionUpdate = useCallback((transaction: CryptoTypes.CryptoTransaction) => {
    setState(prev => {
      const updatedTransactions = prev.transactions.map(t =>
        t.id === transaction.id ? { ...t, ...transaction } : t
      );
      
      const updatedPending = prev.pendingTransactions.filter(t => 
        t.id !== transaction.id || transaction.status === 'pending'
      );

      return {
        ...prev,
        transactions: updatedTransactions,
        pendingTransactions: updatedPending,
        metrics: {
          ...prev.metrics,
          transactionCount: prev.metrics.transactionCount + 1
        }
      };
    });
  }, []);

  /**
   * Fetches user's cryptocurrency wallets
   */
  const getWallets = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));
      const response = await api.get<CryptoTypes.GetWalletsResponse>('/crypto/wallets');
      setState(prev => ({
        ...prev,
        wallets: response.data.data,
        isLoading: false
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error as WebSocketError,
        isLoading: false
      }));
    }
  }, []);

  /**
   * Executes a cryptocurrency exchange with validation and queuing
   */
  const executeExchange = useCallback(async (request: CryptoTypes.ExchangeRequest): Promise<CryptoTypes.CryptoTransaction> => {
    try {
      // Validate exchange request
      await CryptoTypes.exchangeRequestSchema.parseAsync(request);

      // Add to transaction queue
      transactionQueue.current.items.push(request);
      
      // Process queue if not already processing
      if (!transactionQueue.current.processing) {
        await processTransactionQueue();
      }

      const response = await api.post<CryptoTypes.CryptoTransaction>('/crypto/exchange', request);
      
      setState(prev => ({
        ...prev,
        pendingTransactions: [...prev.pendingTransactions, response.data]
      }));

      return response.data;
    } catch (error) {
      throw error;
    }
  }, []);

  /**
   * Processes pending transactions in queue
   */
  const processTransactionQueue = async () => {
    if (transactionQueue.current.processing || transactionQueue.current.items.length === 0) {
      return;
    }

    transactionQueue.current.processing = true;

    try {
      while (transactionQueue.current.items.length > 0) {
        const request = transactionQueue.current.items[0];
        await api.post('/crypto/exchange', request);
        transactionQueue.current.items.shift();
        await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting
      }
    } finally {
      transactionQueue.current.processing = false;
    }
  };

  // Initial data fetch
  useEffect(() => {
    getWallets();
  }, [getWallets]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (priceUpdateTimeout.current) {
        clearTimeout(priceUpdateTimeout.current);
      }
    };
  }, []);

  return {
    wallets: state.wallets,
    transactions: state.transactions,
    pendingTransactions: state.pendingTransactions,
    prices: state.prices,
    metrics: state.metrics,
    isLoading: state.isLoading,
    error: state.error,
    executeExchange,
    getWallets
  };
};

export default useCrypto;