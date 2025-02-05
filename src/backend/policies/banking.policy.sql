-- Banking Policy SQL file for Unbanked platform
-- Implements comprehensive Row Level Security (RLS) policies for banking operations
-- Version: 1.0

-- Helper function to verify enhanced wallet access with security checks
CREATE OR REPLACE FUNCTION verify_enhanced_wallet_access(
    wallet_id uuid,
    amount decimal DEFAULT NULL
) RETURNS boolean AS $$
DECLARE
    user_role user_role;
    user_kyc_level integer;
    daily_total decimal;
    wallet_record wallets%ROWTYPE;
BEGIN
    -- Get user role and KYC level
    SELECT role, kyc_level INTO user_role, user_kyc_level 
    FROM users 
    WHERE id = auth.uid();

    -- Get wallet details
    SELECT * INTO wallet_record 
    FROM wallets 
    WHERE id = wallet_id;

    -- Verify wallet exists and belongs to user
    IF wallet_record.user_id != auth.uid() THEN
        RETURN false;
    END IF;

    -- Check wallet status
    IF wallet_record.status != 'ACTIVE' THEN
        RETURN false;
    END IF;

    -- Verify KYC level requirements
    IF user_kyc_level < CASE
        WHEN amount IS NULL OR amount <= 1000 THEN 1
        WHEN amount <= 10000 THEN 2
        ELSE 3
    END THEN
        RETURN false;
    END IF;

    -- Check daily transaction limits if amount provided
    IF amount IS NOT NULL THEN
        SELECT COALESCE(SUM(ABS(amount)), 0) INTO daily_total
        FROM transactions
        WHERE wallet_id = wallet_record.id
        AND created_at >= CURRENT_DATE;

        -- Enforce role-based limits
        IF (daily_total + ABS(amount)) > CASE
            WHEN user_role = 'USER_LEVEL_1' THEN 1000
            WHEN user_role = 'USER_LEVEL_2' THEN 10000
            WHEN user_role = 'USER_LEVEL_3' THEN 100000
            WHEN user_role = 'ADMINISTRATOR' THEN float8 'infinity'
            ELSE 0
        END THEN
            RETURN false;
        END IF;
    END IF;

    -- Log access verification attempt
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
        'ACCESS_CHECK',
        jsonb_build_object('amount', amount),
        jsonb_build_object(
            'result', true,
            'user_role', user_role,
            'kyc_level', user_kyc_level
        ),
        auth.uid(),
        inet(current_setting('app.client_ip', true)),
        current_setting('app.user_agent', true)
    );

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enhanced wallet access policy with KYC and status checks
CREATE POLICY wallets_enhanced_user_isolation ON wallets
    FOR ALL
    USING (
        auth.uid() = user_id 
        AND status = 'ACTIVE'
        AND EXISTS (
            SELECT 1 
            FROM users 
            WHERE id = auth.uid() 
            AND kyc_level >= CASE
                WHEN balance <= 1000 THEN 1
                WHEN balance <= 10000 THEN 2
                ELSE 3
            END
        )
    )
    WITH CHECK (
        auth.uid() = user_id 
        AND status = 'ACTIVE'
    );

-- Enhanced transaction policy with amount and time-based restrictions
CREATE POLICY transactions_enhanced_control ON transactions
    FOR ALL
    USING (
        wallet_id IN (
            SELECT id 
            FROM wallets 
            WHERE user_id = auth.uid() 
            AND status = 'ACTIVE'
        )
        AND verify_enhanced_wallet_access(wallet_id, amount)
    )
    WITH CHECK (
        wallet_id IN (
            SELECT id 
            FROM wallets 
            WHERE user_id = auth.uid() 
            AND status = 'ACTIVE'
            AND balance >= CASE 
                WHEN type = 'WITHDRAWAL' THEN amount 
                ELSE 0 
            END
        )
        AND verify_enhanced_wallet_access(wallet_id, amount)
    );

-- Enhanced Plaid integration policy with rate limiting
CREATE POLICY plaid_enhanced_integration ON plaid_items
    FOR ALL
    USING (
        auth.uid() = user_id 
        AND status = 'active'
        AND (
            EXTRACT(EPOCH FROM NOW() - last_access) >= 60 
            OR auth.jwt()->>'role' = 'ADMINISTRATOR'
        )
    )
    WITH CHECK (
        auth.uid() = user_id 
        AND status = 'active'
    );

-- Add comments for documentation
COMMENT ON FUNCTION verify_enhanced_wallet_access IS 'Enhanced helper function for wallet access verification with comprehensive security checks';
COMMENT ON POLICY wallets_enhanced_user_isolation IS 'Enhanced wallet access policy enforcing KYC levels and status checks';
COMMENT ON POLICY transactions_enhanced_control IS 'Enhanced transaction policy with amount-based restrictions and balance validation';
COMMENT ON POLICY plaid_enhanced_integration IS 'Enhanced Plaid integration policy with rate limiting and access controls';