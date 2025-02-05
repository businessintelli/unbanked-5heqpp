# Configure Terraform version and required providers
terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"  # v5.0
      version = "~> 5.0"
    }
  }
}

# Define local variables for staging environment
locals {
  environment = "staging"
  common_tags = {
    Environment   = "staging"
    Project      = "unbanked"
    ManagedBy    = "terraform"
    CostCenter   = "staging-ops"
    AutoShutdown = "enabled"
  }
}

# Networking module configuration for staging
module "networking" {
  source = "../../modules/networking"

  environment        = local.environment
  vpc_cidr          = "10.1.0.0/16"
  availability_zones = 2
  enable_flow_logs  = true
  enhanced_monitoring = true
  
  network_acls = {
    strict_mode   = true
    custom_rules  = true
  }

  tags = local.common_tags
}

# Database module configuration for staging
module "database" {
  source = "../../modules/database"

  environment           = local.environment
  instance_class       = "db.t3.large"
  storage_size         = 100
  multi_az            = false
  replica_count       = 1
  backup_retention_days = 7
  enable_encryption    = true
  enhanced_monitoring  = true

  auto_shutdown = {
    enabled       = true
    shutdown_time = "20:00"
    startup_time  = "08:00"
  }

  subnet_ids             = module.networking.private_subnet_ids
  vpc_security_group_ids = module.networking.database_security_group_ids
  
  tags = local.common_tags
}

# Cache module configuration for staging
module "cache" {
  source = "../../modules/cache"

  environment      = local.environment
  node_type       = "cache.t3.medium"
  cluster_size    = 2
  auto_shutdown   = true
  enhanced_logging = true

  subnet_ids         = module.networking.private_subnet_ids
  security_group_ids = module.networking.cache_security_group_ids
  
  tags = local.common_tags
}

# Monitoring module configuration for staging
module "monitoring" {
  source = "../../modules/monitoring"

  environment          = local.environment
  enable_monitoring    = true
  enhanced_logging     = true
  log_retention_days   = 30
  backup_retention_days = 7
  performance_insights = true

  alert_endpoints = ["staging-alerts@unbanked.com"]
  
  cost_alerts = {
    enabled   = true
    threshold = 1000
  }

  tags = local.common_tags
}

# Output the VPC ID
output "vpc_id" {
  description = "The ID of the staging VPC"
  value       = module.networking.vpc_id
}

# Output the database endpoint (marked as sensitive)
output "database_endpoint" {
  description = "The endpoint of the staging database"
  value       = module.database.endpoint
  sensitive   = true
}

# Output the Redis endpoint (marked as sensitive)
output "redis_endpoint" {
  description = "The endpoint of the staging Redis cluster"
  value       = module.cache.endpoint
  sensitive   = true
}