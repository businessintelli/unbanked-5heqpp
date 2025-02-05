-- Profile Management Security Policies
-- Version: 1.0
-- Enhanced Row Level Security implementation for user profiles and KYC documents

-- Function to enable and configure comprehensive RLS for profile management
CREATE OR REPLACE FUNCTION enable_profile_row_level_security()
RETURNS void AS $$
BEGIN
    -- Enable Row Level Security on relevant tables
    ALTER TABLE users ENABLE ROW LEVEL SECURITY;
    ALTER TABLE kyc_documents ENABLE ROW LEVEL SECURITY;

    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS users_select_policy ON users;
    DROP POLICY IF EXISTS users_update_policy ON users;
    DROP POLICY IF EXISTS kyc_documents_select_policy ON kyc_documents;
    DROP POLICY IF EXISTS kyc_documents_insert_policy ON kyc_documents;
    DROP POLICY IF EXISTS kyc_documents_update_policy ON kyc_documents;

    -- Create enhanced SELECT policy for users table with audit support
    CREATE POLICY users_select_policy ON users
        FOR SELECT
        USING (
            auth.uid() = id 
            OR auth.role() IN ('ADMINISTRATOR', 'SUPPORT_STAFF')
        );

    -- Create UPDATE policy for users table with role-based restrictions
    CREATE POLICY users_update_policy ON users
        FOR UPDATE
        USING (
            auth.uid() = id 
            OR auth.role() = 'ADMINISTRATOR'
        )
        WITH CHECK (
            CASE 
                WHEN auth.role() = 'ADMINISTRATOR' THEN 
                    true
                ELSE 
                    (
                        NEW.role = OLD.role 
                        AND NEW.kyc_level = OLD.kyc_level 
                        AND NEW.last_modified = CURRENT_TIMESTAMP
                    )
            END
        );

    -- Create SELECT policy for KYC documents with audit trail
    CREATE POLICY kyc_documents_select_policy ON kyc_documents
        FOR SELECT
        USING (
            auth.uid() = user_id 
            OR auth.role() IN ('ADMINISTRATOR', 'SUPPORT_STAFF')
        );

    -- Create INSERT policy for KYC documents with status validation
    CREATE POLICY kyc_documents_insert_policy ON kyc_documents
        FOR INSERT
        WITH CHECK (
            auth.uid() = user_id 
            AND NEW.status = 'PENDING' 
            AND NEW.verified_by IS NULL
        );

    -- Create UPDATE policy for KYC documents with verification tracking
    CREATE POLICY kyc_documents_update_policy ON kyc_documents
        FOR UPDATE
        USING (
            auth.role() IN ('ADMINISTRATOR', 'SUPPORT_STAFF')
        )
        WITH CHECK (
            NEW.user_id = OLD.user_id 
            AND NEW.verified_by = auth.uid() 
            AND NEW.verification_date = CURRENT_TIMESTAMP
        );

    -- Create security definer function for sensitive profile operations
    CREATE OR REPLACE FUNCTION update_user_profile(
        user_id uuid,
        new_data jsonb,
        OUT success boolean,
        OUT message text
    ) SECURITY DEFINER AS $$
    BEGIN
        -- Verify caller has appropriate permissions
        IF NOT (
            auth.uid() = user_id 
            OR auth.role() = 'ADMINISTRATOR'
        ) THEN
            success := false;
            message := 'Insufficient permissions';
            RETURN;
        END IF;

        -- Update profile with audit logging
        UPDATE users 
        SET 
            updated_at = CURRENT_TIMESTAMP,
            last_modified = CURRENT_TIMESTAMP
        WHERE id = user_id
        AND (
            auth.uid() = id 
            OR auth.role() = 'ADMINISTRATOR'
        );

        success := FOUND;
        message := 'Profile updated successfully';
    EXCEPTION 
        WHEN others THEN
            success := false;
            message := 'Error updating profile: ' || SQLERRM;
    END;
    $$ LANGUAGE plpgsql;

    -- Create security definer function for KYC verification
    CREATE OR REPLACE FUNCTION verify_kyc_document(
        document_id uuid,
        verification_status kyc_status,
        verification_notes text DEFAULT NULL,
        OUT success boolean,
        OUT message text
    ) SECURITY DEFINER AS $$
    BEGIN
        -- Verify caller has appropriate permissions
        IF NOT auth.role() IN ('ADMINISTRATOR', 'SUPPORT_STAFF') THEN
            success := false;
            message := 'Insufficient permissions';
            RETURN;
        END IF;

        -- Update document status with verification tracking
        UPDATE kyc_documents 
        SET 
            status = verification_status,
            verified_by = auth.uid(),
            verification_date = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = document_id;

        success := FOUND;
        message := 'Document verification updated successfully';
    EXCEPTION 
        WHEN others THEN
            success := false;
            message := 'Error updating verification: ' || SQLERRM;
    END;
    $$ LANGUAGE plpgsql;

    -- Create trigger for profile change auditing
    CREATE OR REPLACE FUNCTION audit_profile_changes()
    RETURNS trigger AS $$
    BEGIN
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
            NEW.id,
            TG_OP::audit_action,
            to_jsonb(OLD),
            to_jsonb(NEW),
            auth.uid(),
            inet(current_setting('request.headers')::json->>'x-forwarded-for'),
            current_setting('request.headers')::json->>'user-agent'
        );
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    -- Apply audit trigger to relevant tables
    CREATE TRIGGER audit_users_changes
        AFTER UPDATE ON users
        FOR EACH ROW
        EXECUTE FUNCTION audit_profile_changes();

    CREATE TRIGGER audit_kyc_documents_changes
        AFTER INSERT OR UPDATE ON kyc_documents
        FOR EACH ROW
        EXECUTE FUNCTION audit_profile_changes();

    -- Grant appropriate permissions to authenticated users
    GRANT SELECT ON users TO authenticated;
    GRANT UPDATE ON users TO authenticated;
    GRANT SELECT, INSERT ON kyc_documents TO authenticated;
    GRANT EXECUTE ON FUNCTION update_user_profile TO authenticated;
    GRANT EXECUTE ON FUNCTION verify_kyc_document TO authenticated;
END;
$$ LANGUAGE plpgsql;

-- Execute the function to enable all policies
SELECT enable_profile_row_level_security();

-- Add comments for documentation
COMMENT ON FUNCTION enable_profile_row_level_security IS 'Enables comprehensive RLS policies for profile management with audit capabilities';
COMMENT ON FUNCTION update_user_profile IS 'Securely updates user profile data with permission checks and audit logging';
COMMENT ON FUNCTION verify_kyc_document IS 'Handles KYC document verification with role-based access control';
COMMENT ON FUNCTION audit_profile_changes IS 'Tracks all changes to profile and KYC data with detailed audit information';