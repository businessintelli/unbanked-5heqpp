-- PostgreSQL version 15
-- Authentication and authorization RLS policies for Unbanked platform

-- Function to enable RLS and initialize security settings
CREATE OR REPLACE FUNCTION enable_row_level_security()
RETURNS void AS $$
BEGIN
    -- Enable RLS on all authentication-related tables
    ALTER TABLE users ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE kyc_documents ENABLE ROW LEVEL SECURITY;

    -- Create audit trigger for policy violations
    CREATE TABLE IF NOT EXISTS policy_violations (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        table_name text NOT NULL,
        attempted_operation text NOT NULL,
        user_id uuid NOT NULL,
        violation_time timestamp with time zone DEFAULT now()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Users table policies
CREATE POLICY users_select_policy ON users
    FOR SELECT USING (
        auth.uid() = id 
        OR auth.role() IN ('ADMINISTRATOR', 'SUPPORT_STAFF')
    );

CREATE POLICY users_update_policy ON users
    FOR UPDATE USING (
        (auth.uid() = id AND NOT is_locked) 
        OR auth.role() = 'ADMINISTRATOR'
    )
    WITH CHECK (
        (NEW.role = OLD.role OR auth.role() = 'ADMINISTRATOR')
        AND NEW.id = OLD.id  -- Prevent ID changes
        AND (
            CASE 
                WHEN auth.role() != 'ADMINISTRATOR' THEN
                    NEW.kyc_level = OLD.kyc_level  -- Only admins can change KYC level
                ELSE true
            END
        )
    );

CREATE POLICY users_delete_policy ON users
    FOR DELETE USING (
        auth.role() = 'ADMINISTRATOR'
        AND NOT EXISTS (
            SELECT 1 FROM sessions 
            WHERE user_id = users.id 
            AND is_valid = true
        )
    );

-- Sessions table policies
CREATE POLICY sessions_select_policy ON sessions
    FOR SELECT USING (
        auth.uid() = user_id 
        OR auth.role() = 'ADMINISTRATOR'
    );

CREATE POLICY sessions_insert_policy ON sessions
    FOR INSERT WITH CHECK (
        auth.uid() = user_id 
        AND NOT EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND is_locked
        )
        AND (
            SELECT COUNT(*) FROM sessions 
            WHERE user_id = auth.uid() 
            AND created_at > NOW() - INTERVAL '1 minute'
        ) < 5
        AND (
            SELECT COUNT(*) FROM sessions 
            WHERE user_id = auth.uid() 
            AND is_valid = true
        ) < 3
    );

CREATE POLICY sessions_delete_policy ON sessions
    FOR DELETE USING (
        auth.uid() = user_id 
        OR auth.role() = 'ADMINISTRATOR'
    );

-- KYC documents table policies
CREATE POLICY kyc_documents_select_policy ON kyc_documents
    FOR SELECT USING (
        auth.uid() = user_id 
        OR auth.role() IN ('ADMINISTRATOR', 'SUPPORT_STAFF')
    );

CREATE POLICY kyc_documents_insert_policy ON kyc_documents
    FOR INSERT WITH CHECK (
        auth.uid() = user_id 
        AND EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND mfa_verified 
            AND NOT is_locked
        )
        AND NEW.status = 'PENDING'
        AND (
            SELECT COUNT(*) FROM kyc_documents 
            WHERE user_id = auth.uid() 
            AND document_type = NEW.document_type 
            AND status = 'PENDING'
        ) = 0
    );

CREATE POLICY kyc_documents_update_policy ON kyc_documents
    FOR UPDATE USING (
        auth.role() IN ('ADMINISTRATOR', 'SUPPORT_STAFF')
        AND EXISTS (
            SELECT 1 FROM users 
            WHERE id = kyc_documents.user_id 
            AND NOT is_locked
        )
    )
    WITH CHECK (
        NEW.user_id = OLD.user_id
        AND NEW.document_type = OLD.document_type
        AND NEW.document_hash = OLD.document_hash
    );

CREATE POLICY kyc_documents_delete_policy ON kyc_documents
    FOR DELETE USING (
        auth.role() = 'ADMINISTRATOR'
        AND status IN ('REJECTED', 'EXPIRED')
    );

-- Create function to log policy violations
CREATE OR REPLACE FUNCTION log_policy_violation()
RETURNS trigger AS $$
BEGIN
    INSERT INTO policy_violations (
        table_name,
        attempted_operation,
        user_id
    ) VALUES (
        TG_TABLE_NAME,
        TG_OP,
        auth.uid()
    );
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers for policy violation logging
CREATE TRIGGER users_policy_violation_trigger
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW
    WHEN (NOT (pg_catalog.has_table_privilege(auth.uid()::text, 'users', 'INSERT,UPDATE,DELETE')))
    EXECUTE FUNCTION log_policy_violation();

CREATE TRIGGER sessions_policy_violation_trigger
    AFTER INSERT OR UPDATE OR DELETE ON sessions
    FOR EACH ROW
    WHEN (NOT (pg_catalog.has_table_privilege(auth.uid()::text, 'sessions', 'INSERT,UPDATE,DELETE')))
    EXECUTE FUNCTION log_policy_violation();

CREATE TRIGGER kyc_documents_policy_violation_trigger
    AFTER INSERT OR UPDATE OR DELETE ON kyc_documents
    FOR EACH ROW
    WHEN (NOT (pg_catalog.has_table_privilege(auth.uid()::text, 'kyc_documents', 'INSERT,UPDATE,DELETE')))
    EXECUTE FUNCTION log_policy_violation();

-- Initialize RLS
SELECT enable_row_level_security();

-- Add comments for documentation
COMMENT ON FUNCTION enable_row_level_security IS 'Initializes Row Level Security for authentication tables';
COMMENT ON FUNCTION log_policy_violation IS 'Logs unauthorized attempts to modify authentication data';
COMMENT ON TABLE policy_violations IS 'Tracks security policy violations for audit purposes';