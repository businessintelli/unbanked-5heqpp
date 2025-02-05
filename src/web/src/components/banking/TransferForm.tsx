import React from 'react'; // ^18.2.0
import { useForm } from 'react-hook-form'; // ^7.0.0
import { zodResolver } from '@hookform/resolvers/zod'; // ^3.0.0
import { useDebounce } from 'use-debounce'; // ^9.0.0
import { analytics } from '@segment/analytics-next'; // ^1.0.0

import Button, { buttonVariants } from '../common/Button';
import Input from '../common/Input';
import { useBanking } from '../../hooks/useBanking';
import { transferSchema } from '../../lib/validation';

interface TransferFormProps {
  onSuccess: (data: TransferFormData) => void;
  onError: (error: TransferError) => void;
  defaultValues?: Partial<TransferFormData>;
  complianceLevel: number;
  maxTransferLimit: number;
  onValidationStart?: () => void;
  onValidationComplete?: (isValid: boolean) => void;
}

interface TransferFormData {
  amount: number;
  currency: string;
  recipient: string;
  description: string;
  sourceWallet: string;
  destinationType: 'internal' | 'external';
  purpose: string;
  complianceChecks: ComplianceCheckResult[];
  fees: TransactionFees;
}

interface TransferError {
  code: string;
  message: string;
  field: string | null;
  details: Record<string, any>;
}

const TransferForm: React.FC<TransferFormProps> = ({
  onSuccess,
  onError,
  defaultValues,
  complianceLevel,
  maxTransferLimit,
  onValidationStart,
  onValidationComplete
}) => {
  const {
    wallets,
    createTransaction,
    getTransactionLimits,
    checkCompliance,
    calculateFees
  } = useBanking();

  const form = useForm<TransferFormData>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      currency: 'USD',
      destinationType: 'internal',
      ...defaultValues
    }
  });

  const { watch, setValue, formState: { errors, isSubmitting } } = form;

  // Debounced values for real-time validation
  const [debouncedAmount] = useDebounce(watch('amount'), 500);
  const [debouncedRecipient] = useDebounce(watch('recipient'), 500);

  // Real-time validation effects
  React.useEffect(() => {
    if (!debouncedAmount || !watch('sourceWallet')) return;

    const validateAmount = async () => {
      try {
        onValidationStart?.();
        
        const limits = await getTransactionLimits(watch('sourceWallet'));
        const isWithinLimits = debouncedAmount <= limits.daily && debouncedAmount <= maxTransferLimit;
        
        if (!isWithinLimits) {
          setValue('amount', limits.daily, { shouldValidate: true });
        }

        const fees = await calculateFees({
          amount: debouncedAmount,
          sourceWallet: watch('sourceWallet'),
          destinationType: watch('destinationType')
        });
        setValue('fees', fees, { shouldValidate: true });

        onValidationComplete?.(isWithinLimits);
      } catch (error) {
        onError({
          code: 'VALIDATION_ERROR',
          message: 'Failed to validate amount',
          field: 'amount',
          details: error
        });
      }
    };

    validateAmount();
  }, [debouncedAmount, watch('sourceWallet')]);

  // Compliance validation effect
  React.useEffect(() => {
    if (!debouncedAmount || !debouncedRecipient) return;

    const validateCompliance = async () => {
      try {
        const complianceResult = await checkCompliance({
          amount: debouncedAmount,
          recipient: debouncedRecipient,
          complianceLevel
        });

        setValue('complianceChecks', complianceResult, { shouldValidate: true });
      } catch (error) {
        onError({
          code: 'COMPLIANCE_ERROR',
          message: 'Failed compliance check',
          field: null,
          details: error
        });
      }
    };

    validateCompliance();
  }, [debouncedAmount, debouncedRecipient, complianceLevel]);

  const handleSubmit = async (data: TransferFormData) => {
    try {
      analytics.track('Transfer Initiated', {
        amount: data.amount,
        currency: data.currency,
        destinationType: data.destinationType
      });

      const transaction = await createTransaction({
        walletId: data.sourceWallet,
        type: 'transfer',
        amount: data.amount,
        currency: data.currency,
        metadata: {
          recipient: data.recipient,
          description: data.description,
          purpose: data.purpose,
          complianceChecks: data.complianceChecks,
          fees: data.fees
        }
      });

      onSuccess(data);
      
      analytics.track('Transfer Completed', {
        transactionId: transaction.id,
        amount: data.amount,
        currency: data.currency
      });
    } catch (error) {
      onError({
        code: 'SUBMISSION_ERROR',
        message: 'Failed to process transfer',
        field: null,
        details: error
      });

      analytics.track('Transfer Failed', {
        error: error.message,
        amount: data.amount,
        currency: data.currency
      });
    }
  };

  return (
    <form 
      onSubmit={form.handleSubmit(handleSubmit)}
      className="space-y-4 w-full max-w-md mx-auto"
      aria-label="Transfer Form"
    >
      <div className="space-y-2">
        <Input
          label="Amount"
          type="number"
          error={errors.amount?.message}
          required
          {...form.register('amount')}
          aria-describedby="amount-hint"
        />
        <p id="amount-hint" className="text-sm text-gray-500">
          Maximum transfer: {maxTransferLimit} {watch('currency')}
        </p>
      </div>

      <Input
        label="Currency"
        type="select"
        error={errors.currency?.message}
        required
        {...form.register('currency')}
      >
        <option value="USD">USD</option>
        <option value="EUR">EUR</option>
        <option value="GBP">GBP</option>
      </Input>

      <Input
        label="Source Wallet"
        type="select"
        error={errors.sourceWallet?.message}
        required
        {...form.register('sourceWallet')}
      >
        {wallets?.map(wallet => (
          <option key={wallet.id} value={wallet.id}>
            {wallet.currency} - Balance: {wallet.balance}
          </option>
        ))}
      </Input>

      <Input
        label="Recipient"
        type="text"
        error={errors.recipient?.message}
        required
        {...form.register('recipient')}
      />

      <Input
        label="Description"
        type="text"
        error={errors.description?.message}
        {...form.register('description')}
      />

      <Input
        label="Purpose of Transfer"
        type="text"
        error={errors.purpose?.message}
        required
        {...form.register('purpose')}
      />

      <div className="flex justify-end space-x-2 mt-6">
        <Button
          type="button"
          variant="outline"
          onClick={() => form.reset()}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          isLoading={isSubmitting}
          disabled={Object.keys(errors).length > 0}
        >
          Submit Transfer
        </Button>
      </div>
    </form>
  );
};

export default TransferForm;