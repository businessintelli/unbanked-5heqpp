#!/bin/bash

# Unbanked Platform Monitoring Configuration Script
# Version: 1.0.0
# Requires: kubectl (1.25+), aws-cli (2.0+), datadog-agent (7.0+)

set -euo pipefail

# Load environment variables and configurations
ENVIRONMENT=${ENVIRONMENT:-production}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Global configuration
declare -A LOG_RETENTION_DAYS=(
    ["application"]=30
    ["security"]=90
    ["audit"]=365
)
METRIC_PERIOD=60
API_LATENCY_THRESHOLD=500
ERROR_RATE_THRESHOLD=1
HEALTH_CHECK_INTERVAL=300
CREDENTIAL_ROTATION_PERIOD=30

# Load Kubernetes configurations
load_kubernetes_config() {
    local config_values
    config_values=$(kubectl get configmap unbanked-config -n unbanked -o json)
    LOG_LEVEL=$(echo "$config_values" | jq -r '.data.LOG_LEVEL')
    
    # Load monitoring credentials securely
    SENTRY_DSN=$(kubectl get secret unbanked-secrets -n unbanked -o jsonpath='{.data.SENTRY_DSN}' | base64 -d)
    DATADOG_API_KEY=$(kubectl get secret unbanked-secrets -n unbanked -o jsonpath='{.data.DATADOG_API_KEY}' | base64 -d)
}

# CloudWatch Monitoring Setup
setup_cloudwatch_monitoring() {
    local environment=$1
    local retention_config=$2
    
    echo "Setting up CloudWatch monitoring for environment: $environment"
    
    # Create log groups with appropriate retention
    for log_type in "${!LOG_RETENTION_DAYS[@]}"; do
        aws logs create-log-group \
            --log-group-name "/unbanked/$environment/$log_type" \
            --tags Environment="$environment",Type="$log_type" || true
            
        aws logs put-retention-policy \
            --log-group-name "/unbanked/$environment/$log_type" \
            --retention-in-days "${LOG_RETENTION_DAYS[$log_type]}"
    done
    
    # Configure metric filters
    aws logs put-metric-filter \
        --log-group-name "/unbanked/$environment/application" \
        --filter-name "ApiLatency" \
        --filter-pattern "[timestamp, requestId, duration]" \
        --metric-transformations \
            metricName=ApiLatency,metricNamespace=Unbanked/$environment,metricValue=$duration
            
    # Set up CloudWatch alarms
    aws cloudwatch put-metric-alarm \
        --alarm-name "unbanked-$environment-high-latency" \
        --metric-name ApiLatency \
        --namespace Unbanked/$environment \
        --period $METRIC_PERIOD \
        --evaluation-periods 3 \
        --threshold $API_LATENCY_THRESHOLD \
        --comparison-operator GreaterThanThreshold \
        --alarm-actions "arn:aws:sns:${AWS_REGION}:${AWS_ACCOUNT_ID}:unbanked-alerts"
        
    return 0
}

# Datadog Monitoring Setup
setup_datadog_monitoring() {
    local environment=$1
    local agent_config=$2
    
    echo "Setting up Datadog monitoring for environment: $environment"
    
    # Deploy Datadog agent with APM
    kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: datadog-agent
  namespace: unbanked
spec:
  selector:
    matchLabels:
      app: datadog-agent
  template:
    metadata:
      labels:
        app: datadog-agent
    spec:
      containers:
      - name: datadog-agent
        image: datadog/agent:7
        env:
        - name: DD_API_KEY
          valueFrom:
            secretKeyRef:
              name: unbanked-secrets
              key: DATADOG_API_KEY
        - name: DD_APM_ENABLED
          value: "true"
        - name: DD_LOGS_ENABLED
          value: "true"
        - name: DD_ENV
          value: "$environment"
EOF
    
    # Configure APM and custom metrics
    kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: datadog-agent-config
  namespace: unbanked
data:
  datadog.yaml: |
    apm_config:
      enabled: true
      apm_non_local_traffic: true
    logs_enabled: true
    logs_config:
      container_collect_all: true
    process_config:
      enabled: true
EOF
    
    return 0
}

# Health Check Function
check_monitoring_health() {
    echo "Performing monitoring health check..."
    local health_status=()
    
    # Check CloudWatch connectivity
    if aws cloudwatch list-metrics --namespace Unbanked/$ENVIRONMENT &>/dev/null; then
        health_status+=("cloudwatch=healthy")
    else
        health_status+=("cloudwatch=degraded")
    fi
    
    # Check Datadog agent status
    if kubectl get pods -n unbanked -l app=datadog-agent | grep -q Running; then
        health_status+=("datadog=healthy")
    else
        health_status+=("datadog=degraded")
    fi
    
    # Verify log shipping
    for log_type in "${!LOG_RETENTION_DAYS[@]}"; do
        if aws logs describe-log-streams \
            --log-group-name "/unbanked/$ENVIRONMENT/$log_type" \
            --limit 1 &>/dev/null; then
            health_status+=("logs_$log_type=healthy")
        else
            health_status+=("logs_$log_type=degraded")
        fi
    done
    
    echo "${health_status[*]}"
    return 0
}

# Credential Rotation
rotate_monitoring_credentials() {
    echo "Rotating monitoring credentials..."
    local rotation_timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    # Backup current credentials
    kubectl get secret unbanked-secrets -n unbanked -o yaml > "$SCRIPT_DIR/backup/secrets-$rotation_timestamp.yaml"
    
    # Generate new Datadog API key
    local new_datadog_key=$(dd if=/dev/urandom bs=32 count=1 2>/dev/null | base64)
    
    # Update Kubernetes secrets
    kubectl create secret generic unbanked-secrets-new \
        -n unbanked \
        --from-literal=DATADOG_API_KEY="$new_datadog_key" \
        --dry-run=client -o yaml | kubectl apply -f -
        
    # Update secret metadata
    kubectl annotate secret unbanked-secrets-new \
        -n unbanked \
        rotation.kubernetes.io/last-rotated="$rotation_timestamp"
        
    # Verify new credentials
    if check_monitoring_health | grep -q "degraded"; then
        echo "Credential rotation failed, rolling back..."
        kubectl apply -f "$SCRIPT_DIR/backup/secrets-$rotation_timestamp.yaml"
        return 1
    fi
    
    return 0
}

# Main execution
main() {
    local command=$1
    shift
    
    load_kubernetes_config
    
    case $command in
        "setup")
            setup_cloudwatch_monitoring "$ENVIRONMENT" "${LOG_RETENTION_DAYS[*]}"
            setup_datadog_monitoring "$ENVIRONMENT" "{}"
            ;;
        "health")
            check_monitoring_health
            ;;
        "rotate")
            rotate_monitoring_credentials
            ;;
        *)
            echo "Usage: $0 {setup|health|rotate}"
            exit 1
            ;;
    esac
}

# Execute if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    if [[ $# -eq 0 ]]; then
        echo "Usage: $0 {setup|health|rotate}"
        exit 1
    fi
    
    main "$@"
fi