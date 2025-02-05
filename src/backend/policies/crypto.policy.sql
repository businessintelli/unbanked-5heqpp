-- Enable Row Level Security on all crypto-related tables
ALTER TABLE crypto_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;

-- Create function to check KYC level
CREATE OR REPLACE FUNCTION auth.kyc_level()
RETURNS integer AS $$
BEGIN
    RETURN (
        SELECT kyc_level 
        FROM users 
        WHERE id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crypto Wallets Policies
-- Select Policy: Users can view their own wallets, admins and support can view all
CREATE POLICY crypto_wallets_select_policy ON crypto_wallets
    FOR SELECT USING (
        auth.uid() = user_id 
        OR auth.role() IN ('ADMINISTRATOR', 'SUPPORT_STAFF')
    );

-- Insert Policy: Users with KYC level 2+ can create up to 5 wallets
CREATE POLICY crypto_wallets_insert_policy ON crypto_wallets
    FOR INSERT WITH CHECK (
        auth.uid() = user_id 
        AND auth.kyc_level() >= 2 
        AND (
            SELECT COUNT(*) 
            FROM crypto_wallets 
            WHERE user_id = auth.uid()
        ) < 5
    );

-- Update Policy: Users can update non-balance fields, admins can update all
CREATE POLICY crypto_wallets_update_policy ON crypto_wallets
    FOR UPDATE USING (
        (auth.uid() = user_id AND OLD.balance = NEW.balance) 
        OR auth.role() = 'ADMINISTRATOR'
    );

-- Delete Policy: Admins can delete wallets with no recent transactions
CREATE POLICY crypto_wallets_delete_policy ON crypto_wallets
    FOR DELETE USING (
        auth.role() = 'ADMINISTRATOR' 
        AND NOT EXISTS (
            SELECT 1 
            FROM crypto_transactions 
            WHERE wallet_id = id 
            AND created_at > now() - interval '30 days'
        )
    );

-- Crypto Transactions Policies
-- Select Policy: Users can view their wallet transactions, admins and support can view all
CREATE POLICY crypto_transactions_select_policy ON crypto_transactions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 
            FROM crypto_wallets 
            WHERE id = wallet_id 
            AND user_id = auth.uid()
        ) 
        OR auth.role() IN ('ADMINISTRATOR', 'SUPPORT_STAFF')
    );

-- Insert Policy: Users with KYC level 2+ can create transactions with limits
CREATE POLICY crypto_transactions_insert_policy ON crypto_transactions
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 
            FROM crypto_wallets 
            WHERE id = wallet_id 
            AND user_id = auth.uid() 
            AND auth.kyc_level() >= 2
        ) 
        AND amount <= (
            SELECT CASE 
                WHEN auth.kyc_level() = 2 THEN 1000
                WHEN auth.kyc_level() = 3 THEN 10000
                ELSE 0
            END
        )
    );

-- Update Policy: Admins can update recent transactions
CREATE POLICY crypto_transactions_update_policy ON crypto_transactions
    FOR UPDATE USING (
        auth.role() = 'ADMINISTRATOR' 
        AND created_at > now() - interval '24 hours'
    );

-- Delete Policy: Admins can delete recent transactions
CREATE POLICY crypto_transactions_delete_policy ON crypto_transactions
    FOR DELETE USING (
        auth.role() = 'ADMINISTRATOR' 
        AND created_at > now() - interval '24 hours'
    );

-- Exchange Rates Policies
-- Select Policy: Public read access
CREATE POLICY exchange_rates_select_policy ON exchange_rates
    FOR SELECT USING (true);

-- Insert Policy: Admins can insert unique exchange rates
CREATE POLICY exchange_rates_insert_policy ON exchange_rates
    FOR INSERT WITH CHECK (
        auth.role() = 'ADMINISTRATOR' 
        AND NOT EXISTS (
            SELECT 1 
            FROM exchange_rates 
            WHERE from_currency = NEW.from_currency 
            AND to_currency = NEW.to_currency
        )
    );

-- Update Policy: Admins can update rates with max 10% change
CREATE POLICY exchange_rates_update_policy ON exchange_rates
    FOR UPDATE USING (
        auth.role() = 'ADMINISTRATOR' 
        AND abs(NEW.rate - OLD.rate) / OLD.rate <= 0.10
    );

-- Delete Policy: Admins can delete unused exchange rates
CREATE POLICY exchange_rates_delete_policy ON exchange_rates
    FOR DELETE USING (
        auth.role() = 'ADMINISTRATOR' 
        AND NOT EXISTS (
            SELECT 1 
            FROM crypto_transactions 
            WHERE created_at > now() - interval '24 hours' 
            AND (
                from_currency = from_currency 
                OR to_currency = to_currency
            )
        )
    );

-- Create indexes for policy performance
CREATE INDEX IF NOT EXISTS idx_crypto_wallets_user_id 
    ON crypto_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_transactions_wallet_id 
    ON crypto_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_crypto_transactions_created_at 
    ON crypto_transactions(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_exchange_rates_currencies 
    ON exchange_rates(from_currency, to_currency);

-- Function to enable RLS and verify setup
CREATE OR REPLACE FUNCTION enable_crypto_rls()
RETURNS void AS $$
BEGIN
    -- Verify RLS is enabled
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_tables 
        WHERE tablename = 'crypto_wallets' 
        AND rowsecurity = true
    ) THEN
        RAISE EXCEPTION 'RLS not enabled on crypto_wallets';
    END IF;

    IF NOT EXISTS (
        SELECT 1 
        FROM pg_tables 
        WHERE tablename = 'crypto_transactions' 
        AND rowsecurity = true
    ) THEN
        RAISE EXCEPTION 'RLS not enabled on crypto_transactions';
    END IF;

    IF NOT EXISTS (
        SELECT 1 
        FROM pg_tables 
        WHERE tablename = 'exchange_rates' 
        AND rowsecurity = true
    ) THEN
        RAISE EXCEPTION 'RLS not enabled on exchange_rates';
    END IF;

    -- Verify indexes exist
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_indexes 
        WHERE tablename = 'crypto_wallets' 
        AND indexname = 'idx_crypto_wallets_user_id'
    ) THEN
        RAISE EXCEPTION 'Missing index on crypto_wallets(user_id)';
    END IF;

    RAISE NOTICE 'Crypto RLS setup verified successfully';
END;
$$ LANGUAGE plpgsql;

-- Execute RLS setup verification
SELECT enable_crypto_rls();