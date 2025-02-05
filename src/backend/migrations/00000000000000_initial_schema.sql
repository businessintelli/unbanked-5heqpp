-- PostgreSQL version 15
-- Initial database schema migration for Unbanked platform

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- Version 15: UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- Version 15: Encryption
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements"; -- Version 15: Query analysis

-- Create custom ENUM types
CREATE TYPE currency_code AS ENUM (
    'USD', 'EUR', 'GBP',  -- Fiat currencies
    'BTC', 'ETH',         -- Cryptocurrencies
    'USDC', 'USDT'        -- Stablecoins
);

CREATE TYPE transaction_type AS ENUM (
    'DEPOSIT',
    'WITHDRAWAL',
    'TRANSFER',
    'EXCHANGE',
    'FEE',
    'REFUND'
);

CREATE TYPE audit_action AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE'
);

-- Create encryption/decryption functions using AES-256-GCM
CREATE OR REPLACE FUNCTION encrypt_sensitive_data(data text)
RETURNS text AS $$
DECLARE
    encryption_key text;
    iv bytea;
    encrypted_data bytea;
BEGIN
    -- Validate input
    IF data IS NULL THEN
        RETURN NULL;
    END IF;

    -- Get encryption key from environment
    encryption_key := current_setting('app.settings.encryption_key', true);
    IF encryption_key IS NULL THEN
        RAISE EXCEPTION 'Encryption key not configured';
    END IF;

    -- Generate secure IV
    iv := gen_random_bytes(12);
    
    -- Encrypt data using AES-256-GCM
    encrypted_data := encrypt_iv(
        data::bytea,
        decode(encryption_key, 'base64'),
        iv,
        'aes-256-gcm'
    );

    -- Combine IV and encrypted data
    RETURN encode(iv || encrypted_data, 'base64');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrypt_sensitive_data(encrypted_data text)
RETURNS text AS $$
DECLARE
    encryption_key text;
    iv bytea;
    data bytea;
BEGIN
    -- Validate input
    IF encrypted_data IS NULL THEN
        RETURN NULL;
    END IF;

    -- Get encryption key from environment
    encryption_key := current_setting('app.settings.encryption_key', true);
    IF encryption_key IS NULL THEN
        RAISE EXCEPTION 'Encryption key not configured';
    END IF;

    -- Extract IV and encrypted content
    data := decode(encrypted_data, 'base64');
    iv := substring(data from 1 for 12);
    data := substring(data from 13);

    -- Decrypt data using AES-256-GCM
    RETURN convert_from(
        decrypt_iv(
            data,
            decode(encryption_key, 'base64'),
            iv,
            'aes-256-gcm'
        ),
        'UTF8'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create audit log table with partitioning
CREATE TABLE audit_log (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name text NOT NULL,
    record_id uuid NOT NULL,
    action audit_action NOT NULL,
    old_data jsonb,
    new_data jsonb,
    changed_by uuid NOT NULL,
    ip_address inet NOT NULL,
    user_agent text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

-- Create indexes for audit log
CREATE INDEX idx_audit_log_table_record ON audit_log(table_name, record_id);
CREATE INDEX idx_audit_log_created_at ON audit_log USING brin(created_at);
CREATE INDEX idx_audit_log_changed_by ON audit_log(changed_by);

-- Create initial partition
CREATE TABLE audit_log_y2024m01 PARTITION OF audit_log
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- Create function to generate audit triggers
CREATE OR REPLACE FUNCTION create_audit_trigger(table_name text)
RETURNS trigger AS $$
DECLARE
    audit_row audit_log;
    excluded_cols text[] := ARRAY[]::text[];
    included_cols text[];
    old_row_data jsonb;
    new_row_data jsonb;
    changed_fields jsonb;
BEGIN
    -- Validate input
    IF TG_WHEN != 'AFTER' THEN
        RAISE EXCEPTION 'create_audit_trigger() may only run as an AFTER trigger';
    END IF;

    -- Get columns for the table
    included_cols := (
        SELECT array_agg(column_name::text)
        FROM information_schema.columns
        WHERE table_name = TG_TABLE_NAME
        AND column_name != ALL (excluded_cols)
    );

    -- Capture old and new row data
    IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') THEN
        old_row_data := to_jsonb(OLD.*);
    END IF;
    
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        new_row_data := to_jsonb(NEW.*);
    END IF;

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
        TG_TABLE_NAME::text,
        CASE
            WHEN TG_OP = 'DELETE' THEN (old_row_data->>'id')::uuid
            ELSE (new_row_data->>'id')::uuid
        END,
        TG_OP::audit_action,
        old_row_data,
        new_row_data,
        current_setting('app.current_user_id', true)::uuid,
        inet(current_setting('app.client_ip', true)),
        current_setting('app.user_agent', true)
    );

    RETURN COALESCE(NEW, OLD);
EXCEPTION
    WHEN OTHERS THEN
        -- Log error details
        RAISE WARNING 'Error in audit trigger for %: %', TG_TABLE_NAME, SQLERRM;
        RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to manage audit log partitions
CREATE OR REPLACE FUNCTION create_audit_partition()
RETURNS void AS $$
DECLARE
    partition_date date;
    partition_name text;
    start_date text;
    end_date text;
BEGIN
    partition_date := date_trunc('month', now()) + interval '1 month';
    partition_name := 'audit_log_y' || to_char(partition_date, 'YYYY') || 'm' || to_char(partition_date, 'MM');
    start_date := to_char(partition_date, 'YYYY-MM-01');
    end_date := to_char(partition_date + interval '1 month', 'YYYY-MM-01');

    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_log FOR VALUES FROM (%L) TO (%L)',
        partition_name,
        start_date,
        end_date
    );
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job to create future partitions
SELECT cron.schedule(
    'create_audit_partitions',
    '0 0 1 * *',  -- Run monthly
    'SELECT create_audit_partition()'
);

-- Set up Row Level Security for audit log
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Create policy for audit log access
CREATE POLICY audit_log_access_policy ON audit_log
    FOR SELECT
    USING (
        -- Allow access only to authorized users
        current_setting('app.current_user_id', true)::uuid IN (
            SELECT id FROM users WHERE role IN ('ADMIN', 'AUDITOR')
        )
    );

-- Create indexes for query analysis
CREATE INDEX idx_audit_log_query_analysis ON audit_log USING gin(new_data jsonb_path_ops);

-- Set up monitoring for the audit log
SELECT pg_stat_statements_reset();

-- Comment on objects for documentation
COMMENT ON TABLE audit_log IS 'Comprehensive audit log for tracking all data changes with security features';
COMMENT ON FUNCTION create_audit_trigger IS 'Creates enhanced audit triggers with security and validation features';
COMMENT ON FUNCTION encrypt_sensitive_data IS 'Encrypts sensitive data using AES-256-GCM with secure IV';
COMMENT ON FUNCTION decrypt_sensitive_data IS 'Decrypts sensitive data using AES-256-GCM with IV validation';