-- PostgreSQL version 15
-- Banking schema migration for Unbanked platform

-- Enable pg_partman extension for automated partition management
CREATE EXTENSION IF NOT EXISTS "pg_partman" VERSION '4.7';

-- Create wallet and transaction related enums
CREATE TYPE wallet_type AS ENUM (
    'FIAT',
    'CARD',
    'EXTERNAL'
);

CREATE TYPE wallet_status AS ENUM (
    'ACTIVE',
    'FROZEN',
    'CLOSED'
);

CREATE TYPE transaction_status AS ENUM (
    'PENDING',
    'COMPLETED',
    'FAILED',
    'REVERSED'
);

-- Create wallets table with enhanced security and validation
CREATE TABLE wallets (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type wallet_type NOT NULL,
    currency currency_code NOT NULL,
    balance numeric(28,8) NOT NULL DEFAULT 0 CHECK (balance >= 0),
    status wallet_status NOT NULL DEFAULT 'ACTIVE',
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create partitioned transactions table
CREATE TABLE transactions (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id uuid NOT NULL REFERENCES wallets(id),
    type transaction_type NOT NULL,
    status transaction_status NOT NULL DEFAULT 'PENDING',
    amount numeric(28,8) NOT NULL,
    fee numeric(28,8) NOT NULL DEFAULT 0,
    reference text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

-- Create indexes for performance optimization
CREATE INDEX idx_wallets_user_id ON wallets(user_id);
CREATE INDEX idx_wallets_currency ON wallets(currency);
CREATE INDEX idx_wallets_status ON wallets(status);

CREATE INDEX idx_transactions_wallet_id ON transactions(wallet_id);
CREATE INDEX idx_transactions_created_at ON transactions USING brin(created_at);
CREATE INDEX idx_transactions_type_status ON transactions(type, status);

-- Set up pg_partman for automated transaction table partitioning
SELECT partman.create_parent(
    'public.transactions',
    'created_at',
    'native',
    'monthly',
    p_start_partition := date_trunc('month', current_date)::text
);

-- Create retention policy for old partitions (12 months)
SELECT partman.create_retention_policy(
    'public.transactions',
    'months',
    '12'
);

-- Create function for atomic wallet balance updates
CREATE OR REPLACE FUNCTION update_wallet_balance(
    wallet_id uuid,
    amount numeric
) RETURNS void AS $$
DECLARE
    target_wallet wallets%ROWTYPE;
BEGIN
    -- Lock the wallet row exclusively
    SELECT * INTO target_wallet
    FROM wallets
    WHERE id = wallet_id
    FOR UPDATE;

    -- Validate wallet exists and is active
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Wallet not found';
    END IF;

    IF target_wallet.status != 'ACTIVE' THEN
        RAISE EXCEPTION 'Wallet is not active';
    END IF;

    -- Validate sufficient balance for withdrawals
    IF amount < 0 AND (target_wallet.balance + amount) < 0 THEN
        RAISE EXCEPTION 'Insufficient balance';
    END IF;

    -- Update balance atomically
    UPDATE wallets
    SET balance = balance + amount,
        updated_at = now()
    WHERE id = wallet_id;

    -- Create audit log entry
    INSERT INTO audit_log (
        table_name,
        record_id,
        action,
        old_data,
        new_data,
        changed_by,
        ip_address,
        user_agent
    ) VALUES (
        'wallets',
        wallet_id,
        'UPDATE',
        jsonb_build_object('balance', target_wallet.balance),
        jsonb_build_object('balance', target_wallet.balance + amount),
        current_setting('app.current_user_id', true)::uuid,
        inet(current_setting('app.client_ip', true)),
        current_setting('app.user_agent', true)
    );

EXCEPTION
    WHEN serialization_failure THEN
        -- Handle concurrent transaction conflicts
        RAISE EXCEPTION 'Transaction conflict detected, please retry';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create audit triggers
CREATE TRIGGER wallets_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON wallets
    FOR EACH ROW EXECUTE FUNCTION create_audit_trigger('wallets');

CREATE TRIGGER transactions_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON transactions
    FOR EACH ROW EXECUTE FUNCTION create_audit_trigger('transactions');

-- Enable Row Level Security
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for wallets
CREATE POLICY wallets_user_isolation ON wallets
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id AND status != 'CLOSED');

-- Create RLS policies for transactions
CREATE POLICY transactions_wallet_isolation ON transactions
    FOR ALL
    USING (wallet_id IN (SELECT id FROM wallets WHERE user_id = auth.uid()))
    WITH CHECK (wallet_id IN (SELECT id FROM wallets WHERE user_id = auth.uid() AND status = 'ACTIVE'));

-- Add comments for documentation
COMMENT ON TABLE wallets IS 'Core wallet management table with enhanced security and validation';
COMMENT ON TABLE transactions IS 'Partitioned transaction history with automated maintenance';
COMMENT ON FUNCTION update_wallet_balance IS 'Atomic wallet balance updates with comprehensive validation';

-- Create updated_at triggers
CREATE TRIGGER update_wallets_updated_at
    BEFORE UPDATE ON wallets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();