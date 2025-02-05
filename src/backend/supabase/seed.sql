-- PostgreSQL version 15
-- Initial database seed file for Unbanked platform

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- Version 15: Enhanced password hashing

-- Function to create initial admin users with enhanced security
CREATE OR REPLACE FUNCTION seed_admin_users()
RETURNS void AS $$
DECLARE
    admin_id uuid;
    support_id uuid;
    salt text;
BEGIN
    -- Generate secure salt
    salt := gen_random_bytes(16)::text;

    -- Create administrator account
    INSERT INTO users (
        email,
        password_hash,
        role,
        kyc_level,
        mfa_enabled,
        created_at,
        updated_at
    ) VALUES (
        'admin@unbanked.com',
        crypt('Admin123!@#' || salt, gen_salt('bf', 12)),
        'ADMINISTRATOR',
        3,
        true,
        now(),
        now()
    ) RETURNING id INTO admin_id;

    -- Create support staff account
    INSERT INTO users (
        email,
        password_hash,
        role,
        kyc_level,
        mfa_enabled,
        created_at,
        updated_at
    ) VALUES (
        'support@unbanked.com',
        crypt('Support123!@#' || salt, gen_salt('bf', 12)),
        'SUPPORT_STAFF',
        3,
        true,
        now(),
        now()
    ) RETURNING id INTO support_id;

    -- Create audit log entries for user creation
    INSERT INTO audit_log (
        table_name,
        record_id,
        action,
        new_data,
        changed_by,
        ip_address,
        user_agent
    ) VALUES 
    ('users', admin_id, 'INSERT', 
     jsonb_build_object('email', 'admin@unbanked.com', 'role', 'ADMINISTRATOR'),
     admin_id, '127.0.0.1', 'System Seed'),
    ('users', support_id, 'INSERT',
     jsonb_build_object('email', 'support@unbanked.com', 'role', 'SUPPORT_STAFF'),
     admin_id, '127.0.0.1', 'System Seed');
END;
$$ LANGUAGE plpgsql;

-- Function to seed system settings
CREATE OR REPLACE FUNCTION seed_system_settings()
RETURNS void AS $$
BEGIN
    -- Transaction fee configuration
    INSERT INTO system_settings (
        key,
        value,
        description,
        created_at
    ) VALUES 
    ('transaction_fees', jsonb_build_object(
        'fiat_transfer_fee', 0.001,
        'crypto_exchange_fee', 0.002,
        'withdrawal_fee', 0.0015,
        'fee_threshold', 10000,
        'fee_cap', 100
    ), 'Transaction fee configuration', now()),

    -- KYC level requirements
    ('kyc_requirements', jsonb_build_object(
        'level_1_limit', 1000,
        'level_2_limit', 10000,
        'level_3_limit', 100000,
        'kyc_review_period_days', 365,
        'required_documents', ARRAY['id', 'address', 'income']
    ), 'KYC level requirements', now()),

    -- Security configuration
    ('security_settings', jsonb_build_object(
        'max_login_attempts', 5,
        'lockout_duration_minutes', 30,
        'session_timeout_minutes', 15,
        'mfa_timeout_seconds', 180,
        'api_rate_limit_per_minute', 60,
        'password_minimum_length', 12,
        'password_require_special', true,
        'ip_whitelist_enabled', true
    ), 'Security and rate limiting configuration', now());

    -- Initialize supported currencies
    INSERT INTO supported_currencies (
        currency_code,
        type,
        enabled,
        validation_rules,
        created_at
    ) VALUES 
    -- Fiat currencies
    ('USD', 'FIAT', true, jsonb_build_object(
        'decimal_places', 2,
        'minimum_transfer', 0.01,
        'maximum_transfer', 1000000
    ), now()),
    ('EUR', 'FIAT', true, jsonb_build_object(
        'decimal_places', 2,
        'minimum_transfer', 0.01,
        'maximum_transfer', 1000000
    ), now()),
    ('GBP', 'FIAT', true, jsonb_build_object(
        'decimal_places', 2,
        'minimum_transfer', 0.01,
        'maximum_transfer', 1000000
    ), now()),

    -- Cryptocurrencies
    ('BTC', 'CRYPTO', true, jsonb_build_object(
        'decimal_places', 8,
        'minimum_transfer', 0.00000001,
        'maximum_transfer', 100
    ), now()),
    ('ETH', 'CRYPTO', true, jsonb_build_object(
        'decimal_places', 8,
        'minimum_transfer', 0.00000001,
        'maximum_transfer', 1000
    ), now()),
    ('USDC', 'STABLECOIN', true, jsonb_build_object(
        'decimal_places', 6,
        'minimum_transfer', 0.000001,
        'maximum_transfer', 1000000
    ), now()),
    ('USDT', 'STABLECOIN', true, jsonb_build_object(
        'decimal_places', 6,
        'minimum_transfer', 0.000001,
        'maximum_transfer', 1000000
    ), now());
END;
$$ LANGUAGE plpgsql;

-- Execute seed functions
SELECT seed_admin_users();
SELECT seed_system_settings();

-- Create additional security policies
CREATE POLICY system_settings_admin_only ON system_settings
    FOR ALL
    USING (current_setting('app.current_user_role', true)::user_role = 'ADMINISTRATOR')
    WITH CHECK (current_setting('app.current_user_role', true)::user_role = 'ADMINISTRATOR');

CREATE POLICY supported_currencies_read_all ON supported_currencies
    FOR SELECT
    USING (enabled = true);

CREATE POLICY supported_currencies_admin_modify ON supported_currencies
    FOR ALL
    USING (current_setting('app.current_user_role', true)::user_role = 'ADMINISTRATOR')
    WITH CHECK (current_setting('app.current_user_role', true)::user_role = 'ADMINISTRATOR');

-- Enable Row Level Security
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE supported_currencies ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX idx_system_settings_key ON system_settings(key);
CREATE INDEX idx_supported_currencies_enabled ON supported_currencies(currency_code) WHERE enabled = true;

-- Add audit triggers
CREATE TRIGGER system_settings_audit
    AFTER INSERT OR UPDATE OR DELETE ON system_settings
    FOR EACH ROW EXECUTE FUNCTION create_audit_trigger('system_settings');

CREATE TRIGGER supported_currencies_audit
    AFTER INSERT OR UPDATE OR DELETE ON supported_currencies
    FOR EACH ROW EXECUTE FUNCTION create_audit_trigger('supported_currencies');

-- Add comments for documentation
COMMENT ON FUNCTION seed_admin_users IS 'Creates initial administrator and support staff accounts with enhanced security';
COMMENT ON FUNCTION seed_system_settings IS 'Initializes system-wide configuration settings and supported currencies';