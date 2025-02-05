-- PostgreSQL version 15
-- Cryptocurrency schema migration for Unbanked platform

-- Create custom ENUM types for cryptocurrency operations
CREATE TYPE crypto_currency AS ENUM (
    'BTC',   -- Bitcoin
    'ETH',   -- Ethereum
    'USDC',  -- USD Coin
    'USDT'   -- Tether
);

CREATE TYPE crypto_transaction_type AS ENUM (
    'DEPOSIT',           -- External deposit
    'WITHDRAWAL',        -- External withdrawal
    'EXCHANGE',          -- Currency exchange
    'INTERNAL_TRANSFER'  -- Internal wallet transfer
);

CREATE TYPE crypto_transaction_status AS ENUM (
    'PENDING',    -- Transaction initiated
    'CONFIRMED',  -- Transaction confirmed
    'FAILED',     -- Transaction failed
    'CANCELLED',  -- User cancelled
    'BLOCKED'     -- Blocked by risk system
);

CREATE TYPE blockchain_network AS ENUM (
    'MAINNET',  -- Production network
    'TESTNET',  -- Test network
    'ETHEREUM', -- Ethereum network
    'BITCOIN',  -- Bitcoin network
    'POLYGON'   -- Polygon network
);

-- Create secure function for wallet key encryption
CREATE OR REPLACE FUNCTION encrypt_wallet_key(private_key text)
RETURNS text AS $$
DECLARE
    encryption_key text;
BEGIN
    -- Get encryption key from environment
    encryption_key := current_setting('app.settings.encryption_key', true);
    IF encryption_key IS NULL THEN
        RAISE EXCEPTION 'Encryption key not configured';
    END IF;

    -- Encrypt using AES-256-GCM from pgcrypto
    RETURN encrypt_sensitive_data(private_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create crypto wallets table with partitioning
CREATE TABLE crypto_wallets (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES users(id),
    currency crypto_currency NOT NULL,
    network blockchain_network NOT NULL,
    address text NOT NULL,
    encrypted_private_key text NOT NULL,
    balance numeric(36,18) NOT NULL DEFAULT 0,
    is_custodial boolean NOT NULL DEFAULT true,
    metadata jsonb DEFAULT '{}'::jsonb,
    risk_score numeric(5,2) DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
) PARTITION BY LIST (network);

-- Create partitions for each network
CREATE TABLE crypto_wallets_bitcoin PARTITION OF crypto_wallets 
    FOR VALUES IN ('BITCOIN', 'TESTNET');
CREATE TABLE crypto_wallets_ethereum PARTITION OF crypto_wallets 
    FOR VALUES IN ('ETHEREUM', 'POLYGON');
CREATE TABLE crypto_wallets_mainnet PARTITION OF crypto_wallets 
    FOR VALUES IN ('MAINNET');

-- Create indexes for performance optimization
CREATE UNIQUE INDEX idx_crypto_wallets_user_currency_network 
    ON crypto_wallets (user_id, currency, network);
CREATE UNIQUE INDEX idx_crypto_wallets_address_network 
    ON crypto_wallets (address, network);
CREATE INDEX idx_crypto_wallets_risk_score 
    ON crypto_wallets (risk_score);

-- Create function to update wallet risk score
CREATE OR REPLACE FUNCTION update_wallet_risk_score(wallet_id uuid)
RETURNS numeric AS $$
DECLARE
    new_risk_score numeric;
    risk_threshold numeric;
BEGIN
    -- Get configured risk threshold
    risk_threshold := current_setting('app.settings.wallet_risk_threshold', true)::numeric;
    
    -- Calculate risk score based on transaction patterns
    SELECT COALESCE(
        (
            SELECT AVG(CASE 
                WHEN amount > 10000 THEN 0.8
                WHEN amount > 1000 THEN 0.4
                ELSE 0.1
            END)
            FROM crypto_transactions
            WHERE wallet_id = $1
            AND created_at > now() - interval '30 days'
        ),
        0
    ) INTO new_risk_score;

    -- Update wallet risk score
    UPDATE crypto_wallets
    SET risk_score = new_risk_score,
        updated_at = now()
    WHERE id = wallet_id;

    RETURN new_risk_score;
END;
$$ LANGUAGE plpgsql;

-- Create materialized view for wallet analytics
CREATE MATERIALIZED VIEW mv_wallet_analytics AS
SELECT 
    user_id,
    currency,
    SUM(balance) as total_balance,
    AVG(risk_score) as avg_risk_score,
    COUNT(*) as wallet_count
FROM crypto_wallets
GROUP BY user_id, currency
WITH DATA;

-- Create index on materialized view
CREATE UNIQUE INDEX idx_mv_wallet_analytics 
    ON mv_wallet_analytics (user_id, currency);

-- Set up audit logging for crypto wallets
SELECT create_audit_trigger('crypto_wallets');

-- Create trigger for wallet updates
CREATE TRIGGER crypto_wallets_update_trigger
    BEFORE UPDATE ON crypto_wallets
    FOR EACH ROW
    EXECUTE FUNCTION create_audit_trigger('crypto_wallets');

-- Set up Row Level Security
ALTER TABLE crypto_wallets ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY crypto_wallets_user_policy ON crypto_wallets
    FOR ALL
    USING (user_id = current_setting('app.current_user_id', true)::uuid);

CREATE POLICY crypto_wallets_admin_policy ON crypto_wallets
    FOR ALL
    USING (current_setting('app.current_user_role', true) = 'ADMIN');

-- Create refresh function for materialized view
CREATE OR REPLACE FUNCTION refresh_wallet_analytics()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_wallet_analytics;
END;
$$ LANGUAGE plpgsql;

-- Set up scheduled refresh for materialized view
SELECT cron.schedule(
    'refresh_wallet_analytics',
    '*/15 * * * *',  -- Every 15 minutes
    'SELECT refresh_wallet_analytics()'
);

-- Add comments for documentation
COMMENT ON TABLE crypto_wallets IS 'Stores cryptocurrency wallet information with encryption and risk assessment';
COMMENT ON MATERIALIZED VIEW mv_wallet_analytics IS 'Aggregated wallet statistics for performance optimization';
COMMENT ON FUNCTION encrypt_wallet_key IS 'Securely encrypts wallet private keys using AES-256-GCM';
COMMENT ON FUNCTION update_wallet_risk_score IS 'Calculates and updates wallet risk scores based on transaction patterns';