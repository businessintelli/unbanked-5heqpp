-- PostgreSQL version 15
-- Audit schema extension for enhanced monitoring and compliance

-- Create ENUM types for audit categorization
CREATE TYPE audit_severity AS ENUM (
    'INFO',
    'WARNING',
    'ERROR',
    'CRITICAL'
);

CREATE TYPE audit_category AS ENUM (
    'SECURITY',
    'COMPLIANCE',
    'TRANSACTION',
    'USER_ACCESS',
    'SYSTEM'
);

-- Create detailed audit logging table
CREATE TABLE audit_details (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    audit_log_id uuid NOT NULL REFERENCES audit_log(id) ON DELETE CASCADE,
    severity audit_severity NOT NULL DEFAULT 'INFO',
    category audit_category NOT NULL,
    ip_address inet,
    user_agent text,
    session_id uuid,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create indexes for audit details
CREATE INDEX idx_audit_details_audit_log_id ON audit_details(audit_log_id);
CREATE INDEX idx_audit_details_severity ON audit_details(severity);
CREATE INDEX idx_audit_details_category ON audit_details(category);
CREATE INDEX idx_audit_details_created_at ON audit_details(created_at);

-- Create audit metrics table for aggregated statistics
CREATE TABLE audit_metrics (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name text NOT NULL,
    operation_count integer NOT NULL DEFAULT 0,
    last_operation_at timestamp with time zone NOT NULL DEFAULT now(),
    metrics_data jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Create indexes for audit metrics
CREATE INDEX idx_audit_metrics_table_name ON audit_metrics(table_name);
CREATE INDEX idx_audit_metrics_last_operation ON audit_metrics(last_operation_at);

-- Function to update audit metrics
CREATE OR REPLACE FUNCTION update_audit_metrics()
RETURNS trigger AS $$
DECLARE
    metrics_record audit_metrics;
    updated_metrics jsonb;
BEGIN
    -- Get or create metrics record for the table
    SELECT * INTO metrics_record
    FROM audit_metrics
    WHERE table_name = NEW.table_name
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO audit_metrics (table_name, operation_count, metrics_data)
        VALUES (NEW.table_name, 1, jsonb_build_object(
            'actions', jsonb_build_object(
                NEW.action::text, 1
            ),
            'last_user', NEW.changed_by
        ))
        RETURNING * INTO metrics_record;
    ELSE
        -- Update existing metrics
        updated_metrics := metrics_record.metrics_data;
        
        -- Update action counts
        IF updated_metrics->'actions'->>(NEW.action::text) IS NULL THEN
            updated_metrics := jsonb_set(
                updated_metrics,
                '{actions}'::text[],
                (updated_metrics->'actions') || jsonb_build_object(NEW.action::text, 1)
            );
        ELSE
            updated_metrics := jsonb_set(
                updated_metrics,
                array['actions', NEW.action::text],
                to_jsonb((updated_metrics->'actions'->>(NEW.action::text))::int + 1)
            );
        END IF;

        -- Update metrics record
        UPDATE audit_metrics
        SET operation_count = operation_count + 1,
            last_operation_at = now(),
            metrics_data = updated_metrics
        WHERE id = metrics_record.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for audit metrics
CREATE TRIGGER audit_metrics_trigger
    AFTER INSERT ON audit_log
    FOR EACH ROW
    EXECUTE FUNCTION update_audit_metrics();

-- Set up Row Level Security for audit details
ALTER TABLE audit_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_metrics ENABLE ROW LEVEL SECURITY;

-- Create policies for audit details access
CREATE POLICY audit_details_access_policy ON audit_details
    FOR SELECT
    USING (
        current_setting('app.current_user_id', true)::uuid IN (
            SELECT id FROM users WHERE role IN ('ADMIN', 'AUDITOR', 'COMPLIANCE_OFFICER')
        )
    );

-- Create policies for audit metrics access
CREATE POLICY audit_metrics_access_policy ON audit_metrics
    FOR SELECT
    USING (
        current_setting('app.current_user_id', true)::uuid IN (
            SELECT id FROM users WHERE role IN ('ADMIN', 'AUDITOR', 'COMPLIANCE_OFFICER')
        )
    );

-- Create function to analyze audit patterns
CREATE OR REPLACE FUNCTION analyze_audit_patterns(
    time_window interval,
    severity_threshold audit_severity DEFAULT 'WARNING'
)
RETURNS TABLE (
    category audit_category,
    event_count bigint,
    severity_distribution jsonb,
    top_tables text[]
) AS $$
BEGIN
    RETURN QUERY
    WITH severity_counts AS (
        SELECT 
            ad.category,
            jsonb_object_agg(
                ad.severity::text,
                COUNT(*)
            ) as severities,
            array_agg(DISTINCT al.table_name) FILTER (
                WHERE al.table_name IS NOT NULL
            ) as affected_tables,
            COUNT(*) as total_events
        FROM audit_details ad
        JOIN audit_log al ON ad.audit_log_id = al.id
        WHERE 
            ad.created_at >= now() - time_window
            AND ad.severity >= severity_threshold
        GROUP BY ad.category
    )
    SELECT 
        sc.category,
        sc.total_events,
        sc.severities,
        sc.affected_tables
    FROM severity_counts sc
    ORDER BY sc.total_events DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create view for compliance reporting
CREATE OR REPLACE VIEW compliance_audit_summary AS
SELECT 
    ad.category,
    ad.severity,
    al.table_name,
    date_trunc('hour', ad.created_at) as time_bucket,
    COUNT(*) as event_count,
    jsonb_agg(DISTINCT ad.metadata) FILTER (
        WHERE ad.metadata IS NOT NULL
    ) as event_details
FROM audit_details ad
JOIN audit_log al ON ad.audit_log_id = al.id
WHERE ad.category = 'COMPLIANCE'
GROUP BY 
    ad.category,
    ad.severity,
    al.table_name,
    date_trunc('hour', ad.created_at);

-- Add comments for documentation
COMMENT ON TABLE audit_details IS 'Extended audit logging details for compliance monitoring and security tracking';
COMMENT ON TABLE audit_metrics IS 'Aggregated audit metrics for monitoring and compliance reporting';
COMMENT ON FUNCTION update_audit_metrics() IS 'Updates audit metrics with detailed statistics and metadata';
COMMENT ON FUNCTION analyze_audit_patterns(interval, audit_severity) IS 'Analyzes audit patterns for security and compliance monitoring';
COMMENT ON VIEW compliance_audit_summary IS 'Summarized view of compliance-related audit events for reporting';