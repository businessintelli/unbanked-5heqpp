# Configure Terraform version and required providers
terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

# Generate random suffix for unique resource naming
resource "random_id" "suffix" {
  byte_length = 4
}

# Networking module for VPC and related resources
module "networking" {
  source = "./modules/networking"

  environment             = var.environment
  region                 = var.region
  vpc_cidr               = var.vpc_cidr
  enable_flow_logs       = true
  enable_vpc_endpoints   = true
  network_acls           = var.network_acls
  transit_gateway_config = var.transit_gateway_config

  tags = merge(var.tags, {
    Component = "Networking"
  })
}

# Database module for RDS PostgreSQL setup
module "database" {
  source = "./modules/database"

  environment               = var.environment
  subnet_ids               = module.networking.private_subnets
  vpc_security_group_ids   = module.networking.database_security_group_ids
  instance_class           = var.database_instance_class
  replica_count            = var.database_replica_count
  encryption_enabled       = true
  backup_window            = "03:00-04:00"
  maintenance_window       = "Mon:04:00-Mon:05:00"
  multi_az                 = true
  performance_insights_enabled = true
  deletion_protection      = true

  tags = merge(var.tags, {
    Component = "Database"
  })

  depends_on = [module.networking]
}

# Cache module for Redis cluster setup
module "cache" {
  source = "./modules/cache"

  environment            = var.environment
  subnet_ids            = module.networking.private_subnets
  security_group_ids    = module.networking.cache_security_group_ids
  node_type             = var.redis_node_type
  cluster_size          = var.redis_cluster_size
  encryption_at_rest    = true
  encryption_in_transit = true
  auto_failover         = true
  maintenance_window    = "tue:03:00-tue:04:00"
  snapshot_retention_limit = 7

  tags = merge(var.tags, {
    Component = "Cache"
  })

  depends_on = [module.networking]
}

# Monitoring module for observability setup
module "monitoring" {
  source = "./modules/monitoring"

  environment                = var.environment
  enable_monitoring         = var.enable_monitoring
  backup_retention_days     = var.backup_retention_days
  enable_enhanced_monitoring = true
  monitoring_interval       = 60
  alarm_configurations      = var.alarm_configurations
  log_retention_days       = 90
  enable_audit_logs        = true
  enable_performance_insights = true

  vpc_id                   = module.networking.vpc_id
  database_instance_id     = module.database.instance_id
  redis_cluster_id         = module.cache.cluster_id

  tags = merge(var.tags, {
    Component = "Monitoring"
  })

  depends_on = [
    module.database,
    module.cache
  ]
}

# Output the VPC ID
output "vpc_id" {
  description = "ID of the created VPC"
  value       = module.networking.vpc_id
}

# Output the database endpoint (marked as sensitive)
output "database_endpoint" {
  description = "Endpoint for the primary database instance"
  value       = module.database.endpoint
  sensitive   = true
}

# Output the Redis endpoint (marked as sensitive)
output "redis_endpoint" {
  description = "Endpoint for the Redis cluster"
  value       = module.cache.endpoint
  sensitive   = true
}

# Output monitoring dashboard URL
output "monitoring_dashboard_url" {
  description = "URL for the CloudWatch monitoring dashboard"
  value       = module.monitoring.dashboard_url
}

# Output backup status
output "backup_status" {
  description = "Status of backup configurations"
  value = {
    database_backup_window = module.database.backup_window
    redis_backup_window   = module.cache.backup_window
    retention_days       = var.backup_retention_days
  }
}

# Output high availability status
output "ha_status" {
  description = "High availability configuration status"
  value = {
    database_multi_az     = true
    redis_failover_enabled = true
    replica_count         = var.database_replica_count
    redis_cluster_size    = var.redis_cluster_size
  }
}