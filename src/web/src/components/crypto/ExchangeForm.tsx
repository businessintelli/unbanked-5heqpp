import React, { useState, useEffect, useCallback, useRef } from 'react'; // ^18.2.0
import { z } from 'zod'; // ^3.22.0
import debounce from 'lodash/debounce'; // ^4.17.21
import Input from '../common/Input';
import Button from '../common/Button';
import { useCrypto } from '../../hooks/useCrypto';
import type { CryptoCurrency, ExchangeRequest, CryptoTransaction } from '../../types/crypto';
import { cryptoCurrencySchema, exchangeRequestSchema } from '../../types/crypto';

// Form validation schema with enhanced security checks
const exchangeFormSchema = z.object({
  fromCurrency: cryptoCurrencySchema,
  toCurrency: cryptoCurrencySchema,
  amount: z.string().regex(/^\d+(\.\d{0,8})?$/, 'Invalid amount format'),
  sourceWalletId: z.string().uuid('Invalid source wallet'),
  destinationWalletId: z.string().uuid('Invalid destination wallet'),
  slippageTolerance: z.number().min(0.1).max(5.0)
}).refine(data => data.fromCurrency !== data.toCurrency, {
  message: "Source and destination currencies must be different",
  path: ["toCurrency"]
}).refine(data => parseFloat(data.amount) > 0, {
  message: "Amount must be greater than 0",
  path: ["amount"]
});

interface ExchangeFormProps {
  onSuccess: (transaction: CryptoTransaction) => void;
  onError: (error: Error) => void;
  onProgress: (progress: number) => void;
}

export const ExchangeForm: React.FC<ExchangeFormProps> = ({
  onSuccess,
  onError,
  onProgress
}) => {
  // State management
  const [formState, setFormState] = useState({
    fromCurrency: 'BTC' as CryptoCurrency,
    toCurrency: 'ETH' as CryptoCurrency,
    amount: '',
    sourceWalletId: '',
    destinationWalletId: '',
    slippageTolerance: 1.0
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [estimatedOutput, setEstimatedOutput] = useState<string | null>(null);

  // Hooks and refs
  const { executeExchange, prices, wallets, rateLimit } = useCrypto();
  const lastValidationTime = useRef<number>(0);
  const exchangeTimeout = useRef<NodeJS.Timeout | null>(null);

  // Debounced price calculation with rate limiting
  const calculateExchangeRate = useCallback(
    debounce(async (from: CryptoCurrency, to: CryptoCurrency, amount: string) => {
      if (!amount || !from || !to) return;

      const fromPrice = prices.find(p => p.currency === from)?.price_usd;
      const toPrice = prices.find(p => p.currency === to)?.price_usd;

      if (fromPrice && toPrice) {
        const rate = parseFloat(toPrice) / parseFloat(fromPrice);
        setExchangeRate(rate);
        setEstimatedOutput((parseFloat(amount) * rate).toFixed(8));
      }
    }, 500),
    [prices]
  );

  // Form validation with security checks
  const validateForm = useCallback(async () => {
    try {
      // Rate limiting check
      const now = Date.now();
      if (now - lastValidationTime.current < rateLimit.minInterval) {
        throw new Error(`Please wait ${rateLimit.minInterval / 1000} seconds between requests`);
      }
      lastValidationTime.current = now;

      // Schema validation
      const validatedData = await exchangeFormSchema.parseAsync(formState);

      // Balance check
      const sourceWallet = wallets.find(w => w.id === validatedData.sourceWalletId);
      if (!sourceWallet) throw new Error('Source wallet not found');

      const sourceBalance = parseFloat(sourceWallet.balance);
      const requestedAmount = parseFloat(validatedData.amount);

      if (requestedAmount > sourceBalance) {
        throw new Error('Insufficient balance');
      }

      return validatedData;
    } catch (err) {
      if (err instanceof z.ZodError) {
        throw new Error(err.errors[0].message);
      }
      throw err;
    }
  }, [formState, wallets, rateLimit.minInterval]);

  // Handle form submission with comprehensive error handling
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const validatedData = await validateForm();

      const exchangeRequest: ExchangeRequest = {
        from_wallet_id: validatedData.sourceWalletId,
        to_wallet_id: validatedData.destinationWalletId,
        amount: validatedData.amount,
        from_currency: validatedData.fromCurrency,
        to_currency: validatedData.toCurrency
      };

      // Set timeout for exchange operation
      const timeoutPromise = new Promise((_, reject) => {
        exchangeTimeout.current = setTimeout(() => {
          reject(new Error('Exchange request timed out'));
        }, 30000);
      });

      // Execute exchange with timeout
      const transaction = await Promise.race([
        executeExchange(exchangeRequest),
        timeoutPromise
      ]) as CryptoTransaction;

      onSuccess(transaction);
      setFormState(prev => ({ ...prev, amount: '' }));
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Exchange failed');
      setError(error.message);
      onError(error);
    } finally {
      setLoading(false);
      if (exchangeTimeout.current) {
        clearTimeout(exchangeTimeout.current);
      }
    }
  };

  // Handle form field changes with validation
  const handleChange = (field: keyof typeof formState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const value = field === 'slippageTolerance' ? parseFloat(e.target.value) : e.target.value;
    setFormState(prev => ({ ...prev, [field]: value }));

    if (['fromCurrency', 'toCurrency', 'amount'].includes(field)) {
      calculateExchangeRate(
        formState.fromCurrency,
        formState.toCurrency,
        field === 'amount' ? e.target.value : formState.amount
      );
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (exchangeTimeout.current) {
        clearTimeout(exchangeTimeout.current);
      }
    };
  }, []);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="From Currency"
          value={formState.fromCurrency}
          onChange={handleChange('fromCurrency')}
          as="select"
          required
        >
          {['BTC', 'ETH', 'USDC', 'USDT'].map(currency => (
            <option key={currency} value={currency}>{currency}</option>
          ))}
        </Input>

        <Input
          label="To Currency"
          value={formState.toCurrency}
          onChange={handleChange('toCurrency')}
          as="select"
          required
        >
          {['BTC', 'ETH', 'USDC', 'USDT'].map(currency => (
            <option key={currency} value={currency}>{currency}</option>
          ))}
        </Input>
      </div>

      <Input
        label="Amount"
        type="number"
        value={formState.amount}
        onChange={handleChange('amount')}
        step="0.00000001"
        min="0"
        required
        error={error}
      />

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Source Wallet"
          value={formState.sourceWalletId}
          onChange={handleChange('sourceWalletId')}
          as="select"
          required
        >
          <option value="">Select wallet</option>
          {wallets
            .filter(w => w.currency === formState.fromCurrency)
            .map(wallet => (
              <option key={wallet.id} value={wallet.id}>
                {wallet.address.slice(0, 8)}... ({wallet.balance} {wallet.currency})
              </option>
            ))}
        </Input>

        <Input
          label="Destination Wallet"
          value={formState.destinationWalletId}
          onChange={handleChange('destinationWalletId')}
          as="select"
          required
        >
          <option value="">Select wallet</option>
          {wallets
            .filter(w => w.currency === formState.toCurrency)
            .map(wallet => (
              <option key={wallet.id} value={wallet.id}>
                {wallet.address.slice(0, 8)}... ({wallet.balance} {wallet.currency})
              </option>
            ))}
        </Input>
      </div>

      <Input
        label="Slippage Tolerance (%)"
        type="number"
        value={formState.slippageTolerance}
        onChange={handleChange('slippageTolerance')}
        step="0.1"
        min="0.1"
        max="5.0"
        required
      />

      {exchangeRate && estimatedOutput && (
        <div className="text-sm text-gray-600">
          <p>Exchange Rate: 1 {formState.fromCurrency} = {exchangeRate.toFixed(8)} {formState.toCurrency}</p>
          <p>Estimated Output: {estimatedOutput} {formState.toCurrency}</p>
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        isLoading={loading}
        disabled={loading || !formState.amount}
        fullWidth
      >
        Execute Exchange
      </Button>
    </form>
  );
};

export default ExchangeForm;