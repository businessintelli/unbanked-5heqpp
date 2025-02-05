#!/bin/bash

# Unbanked Platform Database Backup Script
# Version: 1.0.0
# Dependencies:
# - aws-cli v2.0+
# - postgresql-client v15+
# - datadog-agent v7.0+

set -euo pipefail

# Load environment variables and configurations
source /etc/unbanked/env.sh

# Global variables
BACKUP_BUCKET="s3://unbanked-backups-${AWS_REGION}"
BACKUP_RETENTION_DAYS=30
LOG_PATH="/var/log/unbanked/backups"
MONITORING_ENDPOINT="https://api.datadoghq.com/api/v1/series"
MAX_RETRIES=3
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

# Logging function with JSON format
log() {
    local level=$1
    local message=$2
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo "{\"timestamp\":\"$timestamp\",\"level\":\"$level\",\"message\":\"$message\"}" >> "${LOG_PATH}/backup.log"
}

# Send metrics to Datadog
send_metric() {
    local metric_name=$1
    local value=$2
    local tags=$3
    
    curl -X POST "${MONITORING_ENDPOINT}" \
        -H "Content-Type: application/json" \
        -H "DD-API-KEY: ${DD_API_KEY}" \
        -d @- << EOF
{
    "series": [{
        "metric": "unbanked.backup.${metric_name}",
        "points": [[$(date +%s), ${value}]],
        "tags": ${tags}
    }]
}
EOF
}

# Create encrypted backup
create_backup() {
    local db_name=$1
    local backup_type=$2
    local kms_key_id=$3
    local backup_file="${TEMP_DIR}/${db_name}_${TIMESTAMP}.backup"
    local retries=0
    
    log "INFO" "Starting backup creation for ${db_name}"
    
    # Create backup using pg_dump with retry logic
    while [ $retries -lt $MAX_RETRIES ]; do
        if PGPASSWORD="${DB_PASSWORD}" pg_dump \
            -h "${DB_HOST}" \
            -U "${DB_USER}" \
            -d "${db_name}" \
            -F c \
            -Z 9 \
            -f "${backup_file}"; then
            break
        fi
        retries=$((retries + 1))
        log "WARN" "Backup attempt ${retries} failed, retrying..."
        sleep $((2 ** retries))
    done
    
    if [ $retries -eq $MAX_RETRIES ]; then
        log "ERROR" "Backup creation failed after ${MAX_RETRIES} attempts"
        send_metric "backup.failure" 1 "{\"database\":\"${db_name}\",\"type\":\"${backup_type}\"}"
        return 1
    fi
    
    # Calculate checksum
    local checksum=$(sha256sum "${backup_file}" | cut -d' ' -f1)
    
    # Encrypt backup using AWS KMS
    aws kms encrypt \
        --key-id "${kms_key_id}" \
        --plaintext fileb://"${backup_file}" \
        --output text \
        --query CiphertextBlob \
        > "${backup_file}.encrypted"
    
    # Upload to S3 with metadata
    aws s3 cp "${backup_file}.encrypted" \
        "${BACKUP_BUCKET}/${backup_type}/${db_name}_${TIMESTAMP}.backup.encrypted" \
        --metadata "checksum=${checksum},timestamp=${TIMESTAMP},type=${backup_type}"
    
    # Verify upload
    verify_backup "${BACKUP_BUCKET}/${backup_type}/${db_name}_${TIMESTAMP}.backup.encrypted" "${kms_key_id}"
    
    send_metric "backup.success" 1 "{\"database\":\"${db_name}\",\"type\":\"${backup_type}\"}"
    log "INFO" "Backup completed successfully for ${db_name}"
    
    return 0
}

# Verify backup integrity
verify_backup() {
    local backup_path=$1
    local kms_key_id=$2
    local verify_file="${TEMP_DIR}/verify_$(date +%s)"
    
    log "INFO" "Starting backup verification for ${backup_path}"
    
    # Download and decrypt backup
    aws s3 cp "${backup_path}" "${verify_file}.encrypted"
    aws kms decrypt \
        --ciphertext-blob fileb://"${verify_file}.encrypted" \
        --key-id "${kms_key_id}" \
        --output text \
        --query Plaintext \
        > "${verify_file}"
    
    # Verify backup format
    if ! pg_restore -l "${verify_file}" > /dev/null 2>&1; then
        log "ERROR" "Backup verification failed: Invalid backup format"
        send_metric "backup.verify.failure" 1 "{\"reason\":\"format\"}"
        return 1
    fi
    
    send_metric "backup.verify.success" 1 "{\"path\":\"${backup_path}\"}"
    log "INFO" "Backup verification completed successfully"
    
    return 0
}

# Rotate old backups
rotate_backups() {
    local retention_days=$1
    local count=0
    
    log "INFO" "Starting backup rotation (retention: ${retention_days} days)"
    
    # List backups older than retention period
    aws s3 ls "${BACKUP_BUCKET}" --recursive | while read -r line; do
        local backup_date=$(echo "$line" | awk '{print $1}')
        local backup_path=$(echo "$line" | awk '{print $4}')
        local age_days=$(( ($(date +%s) - $(date -d "$backup_date" +%s)) / 86400 ))
        
        if [ $age_days -gt $retention_days ]; then
            # Verify no restore in progress
            if ! aws s3api head-object --bucket "${BACKUP_BUCKET}" --key "${backup_path}" \
                --query 'Metadata.restore_in_progress' --output text | grep -q "true"; then
                
                # Delete backup
                aws s3 rm "${BACKUP_BUCKET}/${backup_path}"
                count=$((count + 1))
                log "INFO" "Deleted old backup: ${backup_path}"
            fi
        fi
    done
    
    send_metric "backup.rotation" $count "{\"retention_days\":${retention_days}}"
    log "INFO" "Backup rotation completed: ${count} backups removed"
    
    return $count
}

# Setup monitoring
setup_monitoring() {
    local monitoring_endpoint=$1
    
    # Verify Datadog agent connectivity
    if ! curl -sf -H "DD-API-KEY: ${DD_API_KEY}" "${monitoring_endpoint}/validate" > /dev/null; then
        log "ERROR" "Failed to connect to Datadog monitoring endpoint"
        return 1
    fi
    
    # Configure backup monitoring
    cat > /etc/datadog-agent/conf.d/postgres_backup.yaml << EOF
init_config:

instances:
  - backup_directory: ${BACKUP_BUCKET}
    min_backup_age_hours: 24
    max_backup_age_hours: 48
    backup_success_metric: "unbanked.backup.success"
    backup_failure_metric: "unbanked.backup.failure"
EOF
    
    systemctl restart datadog-agent
    log "INFO" "Monitoring setup completed successfully"
    
    return 0
}

# Main execution
main() {
    local db_name=$1
    local backup_type=${2:-"daily"}
    
    # Create log directory if it doesn't exist
    mkdir -p "${LOG_PATH}"
    
    # Setup monitoring
    setup_monitoring "${MONITORING_ENDPOINT}"
    
    # Perform backup
    if create_backup "${db_name}" "${backup_type}" "${KMS_KEY_ID}"; then
        # Rotate old backups if backup was successful
        rotate_backups "${BACKUP_RETENTION_DAYS}"
    else
        log "ERROR" "Backup process failed for ${db_name}"
        exit 1
    fi
}

# Execute main function with parameters
main "$@"