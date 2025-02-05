#!/usr/bin/env bash

# Unbanked Platform Deployment Script
# Version: 1.0.0
# Description: Zero-downtime deployment automation for the Unbanked financial platform

set -euo pipefail
IFS=$'\n\t'

# Import environment variables
source "$(dirname "$0")/.env"

# Global variables
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly TIMESTAMP=$(date +%Y%m%d_%H%M%S)
readonly LOG_FILE="deployment_${TIMESTAMP}.log"
readonly DOCKER_REGISTRY=${DOCKER_REGISTRY:-"unbanked.azurecr.io"}
readonly DEPLOY_TIMEOUT=${DEPLOY_TIMEOUT:-300}
readonly HEALTH_CHECK_INTERVAL=${HEALTH_CHECK_INTERVAL:-5}

# Logging configuration
exec 1> >(tee -a "${LOG_FILE}")
exec 2> >(tee -a "${LOG_FILE}" >&2)

# Logging function
log() {
    local level=$1
    shift
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [${level}] $*"
}

# Error handling
trap 'error_handler $? $LINENO $BASH_LINENO "$BASH_COMMAND" $(printf "::%s" ${FUNCNAME[@]:-})' ERR

error_handler() {
    local exit_code=$1
    local line_no=$2
    local bash_lineno=$3
    local last_command=$4
    local func_trace=$5

    log "ERROR" "Command '$last_command' failed with exit code $exit_code at line $line_no"
    log "ERROR" "Function trace: $func_trace"
    
    # Initiate rollback if deployment was in progress
    if [[ -n "${DEPLOYMENT_IN_PROGRESS:-}" ]]; then
        log "ERROR" "Initiating rollback procedure..."
        rollback_deployment
    fi

    exit "$exit_code"
}

# Prerequisites check
check_prerequisites() {
    local environment=$1
    local version=$2

    log "INFO" "Checking deployment prerequisites for environment: $environment"

    # Check required tools
    local required_tools=("kubectl" "docker" "trivy" "curl" "jq")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log "ERROR" "Required tool '$tool' is not installed"
            return 1
        fi
    done

    # Verify Kubernetes connection
    if ! kubectl version --short &> /dev/null; then
        log "ERROR" "Cannot connect to Kubernetes cluster"
        return 1
    }

    # Check Docker registry access
    if ! docker login "${DOCKER_REGISTRY}" &> /dev/null; then
        log "ERROR" "Cannot authenticate with Docker registry"
        return 1
    }

    # Verify namespace exists
    if ! kubectl get namespace "${KUBE_NAMESPACE}" &> /dev/null; then
        log "ERROR" "Namespace ${KUBE_NAMESPACE} does not exist"
        return 1
    }

    # Check cluster resources
    check_cluster_resources

    log "INFO" "Prerequisites check completed successfully"
    return 0
}

# Build and scan Docker images
build_images() {
    local environment=$1
    local version=$2

    log "INFO" "Building Docker images for version: $version"

    # Build backend image
    log "INFO" "Building backend image..."
    docker build \
        --build-arg VERSION="$version" \
        --build-arg NODE_ENV="$environment" \
        -t "${DOCKER_REGISTRY}/backend:${version}" \
        -f infrastructure/docker/backend.Dockerfile .

    # Build frontend image
    log "INFO" "Building frontend image..."
    docker build \
        --build-arg VERSION="$version" \
        --build-arg NODE_ENV="$environment" \
        -t "${DOCKER_REGISTRY}/web:${version}" \
        -f infrastructure/docker/web.Dockerfile .

    # Security scan images
    log "INFO" "Scanning images for vulnerabilities..."
    for image in "backend" "web"; do
        trivy image \
            --severity HIGH,CRITICAL \
            --exit-code 1 \
            "${DOCKER_REGISTRY}/${image}:${version}"
    done

    # Push images to registry
    log "INFO" "Pushing images to registry..."
    for image in "backend" "web"; do
        docker push "${DOCKER_REGISTRY}/${image}:${version}"
    done

    return 0
}

# Deploy to Kubernetes
deploy_kubernetes() {
    local environment=$1
    local version=$2
    
    log "INFO" "Starting Kubernetes deployment for version: $version"
    DEPLOYMENT_IN_PROGRESS=true

    # Update ConfigMaps and Secrets
    kubectl apply -f infrastructure/kubernetes/configmap.yaml
    kubectl apply -f infrastructure/kubernetes/secrets.yaml

    # Deploy backend with canary
    deploy_backend_canary "$version"

    # Deploy frontend with blue-green
    deploy_frontend_blue_green "$version"

    DEPLOYMENT_IN_PROGRESS=false
    log "INFO" "Deployment completed successfully"
    return 0
}

# Canary deployment for backend
deploy_backend_canary() {
    local version=$1
    local canary_weight=5

    log "INFO" "Starting canary deployment for backend..."

    # Deploy canary version
    kubectl apply -f <(sed "s|image: unbanked/backend:.*|image: ${DOCKER_REGISTRY}/backend:${version}|" \
        infrastructure/kubernetes/backend-deployment.yaml)

    # Progressive traffic shift
    while [ "$canary_weight" -lt 100 ]; do
        log "INFO" "Shifting $canary_weight% traffic to canary"
        kubectl patch service backend-service -p "{\"spec\":{\"trafficPolicy\":{\"canary\":${canary_weight}}}}"
        
        # Health check
        if ! check_backend_health; then
            log "ERROR" "Canary health check failed"
            rollback_deployment
            return 1
        fi

        canary_weight=$((canary_weight + 20))
        sleep "$HEALTH_CHECK_INTERVAL"
    done

    # Complete rollout
    kubectl patch service backend-service -p '{"spec":{"trafficPolicy":{"canary":100}}}'
    
    return 0
}

# Blue-Green deployment for frontend
deploy_frontend_blue_green() {
    local version=$1

    log "INFO" "Starting blue-green deployment for frontend..."

    # Deploy new version (green)
    kubectl apply -f <(sed "s|image: unbanked/web:.*|image: ${DOCKER_REGISTRY}/web:${version}|" \
        infrastructure/kubernetes/web-deployment.yaml)

    # Wait for green deployment to be ready
    kubectl rollout status deployment/unbanked-web -n "${KUBE_NAMESPACE}" --timeout="${DEPLOY_TIMEOUT}s"

    # Switch traffic to green
    kubectl patch service web-service -p '{"spec":{"selector":{"version":"'${version}'"}}}'

    # Verify green deployment
    if ! check_frontend_health; then
        log "ERROR" "Green deployment health check failed"
        rollback_deployment
        return 1
    }

    # Remove old version (blue)
    kubectl delete deployment -l "version!=${version},app=unbanked,component=web" -n "${KUBE_NAMESPACE}"

    return 0
}

# Health check functions
check_backend_health() {
    local retry_count=0
    local max_retries=3

    while [ $retry_count -lt $max_retries ]; do
        if curl -sf "http://backend-service/health" > /dev/null; then
            return 0
        fi
        retry_count=$((retry_count + 1))
        sleep "$HEALTH_CHECK_INTERVAL"
    done

    return 1
}

check_frontend_health() {
    local retry_count=0
    local max_retries=3

    while [ $retry_count -lt $max_retries ]; do
        if curl -sf "http://web-service/health" > /dev/null; then
            return 0
        fi
        retry_count=$((retry_count + 1))
        sleep "$HEALTH_CHECK_INTERVAL"
    done

    return 1
}

# Rollback procedure
rollback_deployment() {
    log "WARN" "Initiating rollback procedure..."

    # Restore previous backend version
    kubectl rollout undo deployment/backend-deployment -n "${KUBE_NAMESPACE}"
    
    # Restore previous frontend version
    kubectl rollout undo deployment/unbanked-web -n "${KUBE_NAMESPACE}"

    # Reset service selectors
    kubectl patch service backend-service -p '{"spec":{"trafficPolicy":{"canary":0}}}'
    kubectl patch service web-service -p '{"spec":{"selector":{"version":"'${PREVIOUS_VERSION}'"}}}'

    log "INFO" "Rollback completed"
}

# Check cluster resources
check_cluster_resources() {
    local min_cpu=4000m
    local min_memory=8Gi

    local available_cpu=$(kubectl get nodes -o json | jq -r '.items[].status.allocatable.cpu')
    local available_memory=$(kubectl get nodes -o json | jq -r '.items[].status.allocatable.memory')

    if [[ "$available_cpu" < "$min_cpu" || "$available_memory" < "$min_memory" ]]; then
        log "ERROR" "Insufficient cluster resources"
        return 1
    fi

    return 0
}

# Main deployment function
main() {
    local environment=${1:-}
    local version=${2:-}

    if [[ -z "$environment" || -z "$version" ]]; then
        log "ERROR" "Usage: $0 <environment> <version>"
        exit 1
    fi

    log "INFO" "Starting deployment process for ${environment} environment, version ${version}"

    # Store current version for rollback
    PREVIOUS_VERSION=$(kubectl get deployment/unbanked-web -n "${KUBE_NAMESPACE}" -o jsonpath='{.spec.template.spec.containers[0].image}' | cut -d: -f2)

    # Execute deployment steps
    check_prerequisites "$environment" "$version" || exit 1
    build_images "$environment" "$version" || exit 1
    deploy_kubernetes "$environment" "$version" || exit 1

    log "INFO" "Deployment completed successfully"
}

# Execute main function with provided arguments
main "$@"