# Environment variable with validation to ensure only production/staging values
variable "environment" {
  type        = string
  description = "Deployment environment (production/staging)"

  validation {
    condition     = can(regex("^(production|staging)$", var.environment))
    error_message = "Environment must be either 'production' or 'staging'"
  }
}

# AWS region with default value
variable "region" {
  type        = string
  description = "AWS region for resource deployment"
  default     = "us-east-1"
}

# VPC CIDR block with default value
variable "vpc_cidr" {
  type        = string
  description = "CIDR block for VPC"
  default     = "10.0.0.0/16"
}

# RDS instance class with default value
variable "database_instance_class" {
  type        = string
  description = "RDS instance class for database"
  default     = "db.r6g.xlarge"
}

# Database read replicas count with validation
variable "database_replica_count" {
  type        = number
  description = "Number of database read replicas"
  default     = 2

  validation {
    condition     = var.database_replica_count >= 0 && var.database_replica_count <= 5
    error_message = "Read replica count must be between 0 and 5"
  }
}

# Redis node type with default value
variable "redis_node_type" {
  type        = string
  description = "Redis node instance type"
  default     = "cache.r6g.large"
}

# Redis cluster size with validation for HA
variable "redis_cluster_size" {
  type        = number
  description = "Number of nodes in Redis cluster"
  default     = 3

  validation {
    condition     = var.redis_cluster_size >= 3
    error_message = "Redis cluster must have at least 3 nodes for high availability"
  }
}

# Monitoring toggle with default enabled
variable "enable_monitoring" {
  type        = bool
  description = "Enable enhanced monitoring and alerting"
  default     = true
}

# Backup retention period with validation
variable "backup_retention_days" {
  type        = number
  description = "Number of days to retain backups"
  default     = 30

  validation {
    condition     = var.backup_retention_days >= 7
    error_message = "Backup retention must be at least 7 days"
  }
}

# Resource tagging with default project tags
variable "tags" {
  type        = map(string)
  description = "Common tags to apply to all resources"
  default = {
    Project    = "Unbanked"
    ManagedBy  = "Terraform"
  }
}