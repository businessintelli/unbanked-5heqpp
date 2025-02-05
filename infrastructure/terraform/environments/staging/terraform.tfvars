# Core environment configuration
environment = "staging"
region      = "us-east-1"
vpc_cidr    = "10.1.0.0/16"

# Database configuration - optimized for staging workloads
database_instance_class = "db.t3.large"
database_replica_count  = 1
backup_retention_days   = 7

# Redis configuration - minimal HA setup for staging
redis_node_type    = "cache.t3.medium"
redis_cluster_size = 2

# Monitoring and operational settings
enable_monitoring = true

# Resource tagging for staging environment
tags = {
  Environment  = "staging"
  Project      = "unbanked"
  ManagedBy    = "terraform"
  CostCenter   = "staging-infrastructure"
}