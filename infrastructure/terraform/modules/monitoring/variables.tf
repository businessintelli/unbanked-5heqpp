# Environment variable for resource naming and tagging
variable "environment" {
  type        = string
  description = "Environment name for resource naming and tagging (e.g., production, staging)"
  
  validation {
    condition     = can(regex("^(production|staging|development)$", var.environment))
    error_message = "Environment must be one of: production, staging, development"
  }
}

# Datadog API key for authentication and integration
variable "datadog_api_key" {
  type        = string
  description = "Datadog API key for authentication and integration"
  sensitive   = true
  
  validation {
    condition     = length(var.datadog_api_key) > 0
    error_message = "Datadog API key cannot be empty"
  }
}

# Log retention configuration for different log groups
variable "log_retention_days" {
  type        = map(number)
  description = "Log retention periods in days for different log groups"
  
  default = {
    application = 30
    security    = 90
  }

  validation {
    condition     = alltrue([for k, v in var.log_retention_days : contains([1,3,5,7,14,30,60,90,120,150,180,365,400,545,731,1827,3653], v)])
    error_message = "Log retention days must be one of the allowed CloudWatch values"
  }
}

# Evaluation period for CloudWatch alarms
variable "evaluation_period" {
  type        = number
  description = "Period for evaluating CloudWatch alarms in minutes"
  default     = 5

  validation {
    condition     = var.evaluation_period > 0 && var.evaluation_period <= 24
    error_message = "Evaluation period must be between 1 and 24 minutes"
  }
}

# Metric collection period configuration
variable "metric_period" {
  type        = number
  description = "Period for CloudWatch metrics collection in seconds"
  default     = 60

  validation {
    condition     = contains([1, 5, 10, 30, 60, 300, 900, 3600], var.metric_period)
    error_message = "Metric period must be one of the allowed CloudWatch values"
  }
}

# API latency threshold for alerting
variable "api_latency_threshold" {
  type        = number
  description = "API latency threshold in milliseconds for alerting"
  default     = 500

  validation {
    condition     = var.api_latency_threshold >= 100 && var.api_latency_threshold <= 2000
    error_message = "API latency threshold must be between 100ms and 2000ms"
  }
}

# Error rate threshold for alerting
variable "error_rate_threshold" {
  type        = number
  description = "Error rate threshold percentage for alerting"
  default     = 1

  validation {
    condition     = var.error_rate_threshold >= 0 && var.error_rate_threshold <= 100
    error_message = "Error rate threshold must be between 0 and 100 percent"
  }
}