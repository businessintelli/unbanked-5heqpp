# Variables for Redis cache module configuration
# Defines settings for AWS ElastiCache Redis cluster with security, performance, and HA requirements

variable "environment" {
  type        = string
  description = "Environment name for resource naming (e.g., production, staging)"
  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.environment))
    error_message = "Environment name must contain only lowercase letters, numbers, and hyphens"
  }
}

variable "subnet_ids" {
  type        = list(string)
  description = "List of subnet IDs for Redis cluster deployment across multiple AZs"
  validation {
    condition     = length(var.subnet_ids) >= 2
    error_message = "At least two subnet IDs are required for high availability"
  }
}

variable "security_group_ids" {
  type        = list(string)
  description = "List of security group IDs to control Redis cluster access"
  validation {
    condition     = length(var.security_group_ids) > 0
    error_message = "At least one security group ID is required"
  }
}

variable "redis_auth_token" {
  type        = string
  description = "Authentication token for Redis cluster access"
  sensitive   = true
  validation {
    condition     = length(var.redis_auth_token) >= 16
    error_message = "Redis auth token must be at least 16 characters long"
  }
}

variable "node_type" {
  type        = string
  description = "Redis node instance type for the cluster"
  default     = "cache.t4g.medium"
  validation {
    condition     = can(regex("^cache\\.[a-z0-9]+\\.[a-z0-9]+$", var.node_type))
    error_message = "Invalid Redis node instance type format"
  }
}

variable "num_cache_clusters" {
  type        = number
  description = "Number of cache clusters in the replication group"
  default     = 2
  validation {
    condition     = var.num_cache_clusters >= 2
    error_message = "At least two cache clusters are required for high availability"
  }
}

variable "maintenance_window" {
  type        = string
  description = "Weekly time range for maintenance operations"
  default     = "sun:05:00-sun:07:00"
  validation {
    condition     = can(regex("^[a-z]{3}:[0-9]{2}:[0-9]{2}-[a-z]{3}:[0-9]{2}:[0-9]{2}$", var.maintenance_window))
    error_message = "Invalid maintenance window format"
  }
}

variable "snapshot_retention_limit" {
  type        = number
  description = "Number of days to retain automatic cache cluster snapshots"
  default     = 7
  validation {
    condition     = var.snapshot_retention_limit >= 1 && var.snapshot_retention_limit <= 35
    error_message = "Snapshot retention limit must be between 1 and 35 days"
  }
}

variable "sns_topic_arn" {
  type        = string
  description = "SNS topic ARN for Redis cluster notifications"
}