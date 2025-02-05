variable "environment" {
  type        = string
  description = "Environment name (e.g., production, staging)"
  validation {
    condition     = can(regex("^(production|staging|development)$", var.environment))
    error_message = "Environment must be production, staging, or development"
  }
}

variable "database_name" {
  type        = string
  description = "Name of the PostgreSQL database to create"
  default     = "unbanked"
  validation {
    condition     = can(regex("^[a-zA-Z][a-zA-Z0-9_]*$", var.database_name))
    error_message = "Database name must start with a letter and contain only alphanumeric characters and underscores"
  }
}

variable "instance_class" {
  type        = string
  description = "RDS instance class for both primary and replica instances"
  default     = "db.r6g.xlarge"
  validation {
    condition     = can(regex("^db\\.[trxmz][3-7][a-z]\\.(micro|small|medium|large|xlarge|[248]xlarge)$", var.instance_class))
    error_message = "Invalid RDS instance class specified"
  }
}

variable "storage_size" {
  type        = number
  description = "Allocated storage size in GB"
  default     = 100
  validation {
    condition     = var.storage_size >= 20 && var.storage_size <= 16384
    error_message = "Storage size must be between 20 and 16384 GB"
  }
}

variable "replica_count" {
  type        = number
  description = "Number of read replicas to create"
  default     = 2
  validation {
    condition     = var.replica_count >= 0 && var.replica_count <= 5
    error_message = "Replica count must be between 0 and 5"
  }
}

variable "subnet_ids" {
  type        = list(string)
  description = "List of subnet IDs where the database instances will be deployed"
  validation {
    condition     = length(var.subnet_ids) >= 2
    error_message = "At least two subnet IDs are required for high availability"
  }
}

variable "vpc_security_group_ids" {
  type        = list(string)
  description = "List of security group IDs to associate with the database instances"
}

variable "parameter_group_family" {
  type        = string
  description = "PostgreSQL parameter group family"
  default     = "postgres15"
  validation {
    condition     = can(regex("^postgres[0-9]{2}$", var.parameter_group_family))
    error_message = "Invalid PostgreSQL parameter group family"
  }
}

variable "backup_retention_days" {
  type        = number
  description = "Number of days to retain automated backups"
  default     = 30
  validation {
    condition     = var.backup_retention_days >= 0 && var.backup_retention_days <= 35
    error_message = "Backup retention days must be between 0 and 35"
  }
}

variable "multi_az" {
  type        = bool
  description = "Enable Multi-AZ deployment for high availability"
  default     = true
}

variable "enable_encryption" {
  type        = bool
  description = "Enable storage encryption using AWS KMS"
  default     = true
}

variable "tags" {
  type        = map(string)
  description = "Tags to apply to all database resources"
  default     = {}
}