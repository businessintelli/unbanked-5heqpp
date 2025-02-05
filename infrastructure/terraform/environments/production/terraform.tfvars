# Environment Configuration
environment = "production"
region     = "us-east-1"

# Network Configuration
vpc_cidr = "10.0.0.0/16"

# Database Configuration
database_instance_class = "db.r6g.4xlarge"
database_replica_count  = 3
backup_retention_days   = 35

# Redis Configuration
redis_node_type    = "cache.r6g.2xlarge"
redis_cluster_size = 5

# Monitoring Configuration
enable_monitoring = true
monitoring_config = {
  metrics_retention_days     = 90
  alert_evaluation_period   = 5
  alert_datapoints_required = 3
  enable_detailed_monitoring = true
}

# Security Configuration
security_config = {
  enable_encryption = true
  ssl_policy        = "ELBSecurityPolicy-TLS-1-2-2017-01"
  enable_waf        = true
  enable_shield     = true
}

# Resource Tags
tags = {
  Project            = "Unbanked"
  Environment        = "Production"
  ManagedBy         = "Terraform"
  CostCenter        = "PROD-001"
  DataClassification = "Confidential"
  ComplianceScope   = "PCI-DSS"
}