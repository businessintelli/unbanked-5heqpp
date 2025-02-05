-- PostgreSQL version 15
-- Authentication and authorization schema migration for Unbanked platform

-- Create user role enum type
CREATE TYPE user_role AS ENUM (
    'USER_LEVEL_1',   -- Basic access
    'USER_LEVEL_2',   -- Enhanced access with basic trading
    'USER_LEVEL_3',   -- Full access with advanced trading
    'SUPPORT_STAFF',  -- Support team access
    'ADMINISTRATOR'   -- Full administrative access
);

-- Create KYC status enum type
CREATE TYPE kyc_status AS ENUM (
    'PENDING',    -- Document submitted, awaiting verification
    'VERIFIED',   -- Document verified successfully
    'REJECTED',   -- Document verification failed
    'EXPIRED'     -- Document needs renewal
);

-- Create KYC document type enum
CREATE TYPE kyc_document_type AS ENUM (
    'PASSPORT',
    'DRIVERS_LICENSE',
    'NATIONAL_ID',
    'PROOF_OF_ADDRESS'
);

-- Create users table with enhanced security features
CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    email text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    role user_role NOT NULL DEFAULT 'USER_LEVEL_1',
    kyc_level integer NOT NULL DEFAULT 0,
    mfa_enabled boolean NOT NULL DEFAULT false,
    mfa_secret text,  -- Encrypted using pgcrypto
    last_login timestamp with time zone,
    login_attempts integer NOT NULL DEFAULT 0,
    locked_until timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Create sessions table for managing user sessions
CREATE TABLE sessions (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token text NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    ip_address inet NOT NULL,
    user_agent text,
    device_id text,
    is_valid boolean NOT NULL DEFAULT true,
    CONSTRAINT max_sessions_per_user CHECK (
        (SELECT count(*) FROM sessions s2 
         WHERE s2.user_id = sessions.user_id AND s2.is_valid = true) <= 3
    )
);

-- Create KYC documents table
CREATE TABLE kyc_documents (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_type kyc_document_type NOT NULL,
    document_number text NOT NULL,
    document_hash text NOT NULL,  -- Hash of the document for integrity verification
    status kyc_status NOT NULL DEFAULT 'PENDING',
    verified_at timestamp with time zone,
    expires_at timestamp with time zone,
    storage_path text NOT NULL,  -- Encrypted path to document storage
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create indexes for performance optimization
CREATE INDEX idx_users_email ON users USING btree (email);
CREATE INDEX idx_users_role_kyc ON users USING btree (role, kyc_level);
CREATE INDEX idx_sessions_user_valid ON sessions USING btree (user_id) WHERE is_valid = true;
CREATE INDEX idx_sessions_expires ON sessions USING btree (expires_at);
CREATE INDEX idx_kyc_documents_user ON kyc_documents USING btree (user_id, status);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create function to check login attempts and implement rate limiting
CREATE OR REPLACE FUNCTION check_login_attempts(user_id uuid)
RETURNS boolean AS $$
DECLARE
    max_attempts integer := 5;
    lockout_duration interval := interval '15 minutes';
    user_record users%ROWTYPE;
BEGIN
    SELECT * INTO user_record FROM users WHERE id = user_id;
    
    -- Check if account is locked
    IF user_record.locked_until IS NOT NULL AND user_record.locked_until > now() THEN
        RETURN false;
    END IF;
    
    -- Reset attempts if lockout period has passed
    IF user_record.locked_until IS NOT NULL AND user_record.locked_until <= now() THEN
        UPDATE users 
        SET login_attempts = 1, locked_until = NULL 
        WHERE id = user_id;
        RETURN true;
    END IF;
    
    -- Increment attempts and check for lockout
    IF user_record.login_attempts >= max_attempts THEN
        UPDATE users 
        SET locked_until = now() + lockout_duration 
        WHERE id = user_id;
        RETURN false;
    END IF;
    
    -- Increment attempt counter
    UPDATE users 
    SET login_attempts = login_attempts + 1 
    WHERE id = user_id;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers for updated_at columns
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_kyc_documents_updated_at
    BEFORE UPDATE ON kyc_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create audit log triggers
CREATE TRIGGER audit_users_changes
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION create_audit_trigger('users');

CREATE TRIGGER audit_sessions_changes
    AFTER INSERT OR UPDATE OR DELETE ON sessions
    FOR EACH ROW EXECUTE FUNCTION create_audit_trigger('sessions');

CREATE TRIGGER audit_kyc_documents_changes
    AFTER INSERT OR UPDATE OR DELETE ON kyc_documents
    FOR EACH ROW EXECUTE FUNCTION create_audit_trigger('kyc_documents');

-- Set up Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_documents ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY users_self_access ON users
    FOR ALL
    USING (id = current_setting('app.current_user_id', true)::uuid)
    WITH CHECK (id = current_setting('app.current_user_id', true)::uuid);

CREATE POLICY users_admin_access ON users
    FOR ALL
    USING (current_setting('app.current_user_role', true)::user_role = 'ADMINISTRATOR');

CREATE POLICY sessions_self_access ON sessions
    FOR ALL
    USING (user_id = current_setting('app.current_user_id', true)::uuid)
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);

CREATE POLICY kyc_documents_self_access ON kyc_documents
    FOR SELECT
    USING (user_id = current_setting('app.current_user_id', true)::uuid);

CREATE POLICY kyc_documents_support_access ON kyc_documents
    FOR SELECT
    USING (current_setting('app.current_user_role', true)::user_role IN ('SUPPORT_STAFF', 'ADMINISTRATOR'));

-- Add comments for documentation
COMMENT ON TABLE users IS 'Core user accounts table with enhanced security features and role-based access control';
COMMENT ON TABLE sessions IS 'User session management with device tracking and security constraints';
COMMENT ON TABLE kyc_documents IS 'KYC document management with secure storage and verification tracking';
COMMENT ON FUNCTION check_login_attempts IS 'Implements rate limiting and account lockout protection';