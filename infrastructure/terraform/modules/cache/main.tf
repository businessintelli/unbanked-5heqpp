# AWS Provider version ~> 5.0
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Local variables for resource naming and tagging
locals {
  redis_cluster_id         = "${var.environment}-redis-cluster"
  redis_parameter_group    = "${var.environment}-redis-params"
  redis_subnet_group      = "${var.environment}-redis-subnet"
  redis_monitoring_role   = "${var.environment}-redis-monitoring"
  common_tags = {
    Environment = var.environment
    ManagedBy   = "Terraform"
    Service     = "Cache"
    UpdatedAt   = timestamp()
  }
}

# Input Variables
variable "environment" {
  type        = string
  description = "Environment name for resource naming and tagging"
}

variable "subnet_ids" {
  type        = list(string)
  description = "List of subnet IDs for Redis deployment across multiple AZs"
}

variable "security_group_ids" {
  type        = list(string)
  description = "List of security group IDs for Redis cluster network access control"
}

variable "redis_auth_token" {
  type        = string
  description = "Authentication token for Redis cluster access"
  sensitive   = true
}

variable "node_type" {
  type        = string
  description = "Redis node instance type for performance optimization"
  default     = "cache.t4g.medium"
}

variable "num_cache_clusters" {
  type        = number
  description = "Number of cache clusters for high availability"
  default     = 2
}

variable "maintenance_window" {
  type        = string
  description = "Weekly maintenance window"
  default     = "sun:05:00-sun:07:00"
}

variable "snapshot_retention_limit" {
  type        = number
  description = "Number of days to retain backups"
  default     = 7
}

variable "sns_topic_arn" {
  type        = string
  description = "SNS topic ARN for Redis cluster notifications"
}

# Redis Parameter Group
resource "aws_elasticache_parameter_group" "redis_params" {
  family      = "redis7"
  description = "Redis parameter group for Unbanked platform"

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  parameter {
    name  = "timeout"
    value = "300"
  }

  parameter {
    name  = "tcp-keepalive"
    value = "300"
  }

  parameter {
    name  = "maxclients"
    value = "65000"
  }

  parameter {
    name  = "activerehashing"
    value = "yes"
  }

  tags = local.common_tags
}

# Redis Subnet Group
resource "aws_elasticache_subnet_group" "redis_subnet" {
  name        = local.redis_subnet_group
  subnet_ids  = var.subnet_ids
  description = "Subnet group for Redis cluster deployment"
  tags        = local.common_tags
}

# Redis Replication Group
resource "aws_elasticache_replication_group" "redis_cluster" {
  replication_group_id          = local.redis_cluster_id
  description                   = "Redis cluster for Unbanked platform"
  node_type                     = var.node_type
  num_cache_clusters           = var.num_cache_clusters
  parameter_group_name         = aws_elasticache_parameter_group.redis_params.name
  port                         = 6379
  subnet_group_name            = aws_elasticache_subnet_group.redis_subnet.name
  security_group_ids           = var.security_group_ids
  automatic_failover_enabled   = true
  multi_az_enabled            = true
  auth_token                   = var.redis_auth_token
  transit_encryption_enabled   = true
  at_rest_encryption_enabled   = true
  engine                       = "redis"
  engine_version              = "7.0"
  maintenance_window          = var.maintenance_window
  snapshot_retention_limit    = var.snapshot_retention_limit
  snapshot_window             = "03:00-05:00"
  notification_topic_arn      = var.sns_topic_arn
  apply_immediately           = false
  auto_minor_version_upgrade = true
  tags                        = local.common_tags
}

# Outputs
output "primary_endpoint_address" {
  description = "Redis cluster primary endpoint address"
  value       = aws_elasticache_replication_group.redis_cluster.primary_endpoint_address
}

output "reader_endpoint_address" {
  description = "Redis cluster reader endpoint address"
  value       = aws_elasticache_replication_group.redis_cluster.reader_endpoint_address
}

output "port" {
  description = "Redis cluster port"
  value       = aws_elasticache_replication_group.redis_cluster.port
}

output "configuration_endpoint_address" {
  description = "Redis cluster configuration endpoint address"
  value       = aws_elasticache_replication_group.redis_cluster.configuration_endpoint_address
}