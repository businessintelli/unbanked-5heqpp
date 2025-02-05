# AWS Provider ~> 5.0
# Datadog Provider ~> 3.0

# Variables
variable "environment" {
  type        = string
  description = "Environment name for resource naming and tagging (e.g., dev, staging, prod)"
}

variable "datadog_api_key" {
  type        = string
  description = "Datadog API key for authentication and integration"
  sensitive   = true
}

variable "log_retention_days" {
  type        = map(number)
  description = "Log retention periods in days for different log groups"
  default = {
    application = 30
    security    = 90
  }
}

variable "evaluation_period" {
  type        = number
  description = "Number of periods for evaluating CloudWatch alarms"
  default     = 5
}

variable "metric_period" {
  type        = number
  description = "Period for CloudWatch metrics in seconds"
  default     = 60
}

variable "api_latency_threshold" {
  type        = number
  description = "API latency threshold in milliseconds for alerting"
  default     = 500
}

variable "error_rate_threshold" {
  type        = number
  description = "Error rate threshold percentage for alerting"
  default     = 1
}

# Local values
locals {
  log_group_names = {
    application = "/unbanked/${var.environment}/application"
    security    = "/unbanked/${var.environment}/security"
  }
}

# CloudWatch Log Groups
resource "aws_cloudwatch_log_group" "application_logs" {
  name              = local.log_group_names.application
  retention_in_days = var.log_retention_days.application

  tags = {
    Environment = var.environment
    Service     = "monitoring"
    ManagedBy   = "terraform"
  }
}

resource "aws_cloudwatch_log_group" "security_logs" {
  name              = local.log_group_names.security
  retention_in_days = var.log_retention_days.security

  tags = {
    Environment = var.environment
    Service     = "monitoring"
    ManagedBy   = "terraform"
  }
}

# CloudWatch Alarms
resource "aws_cloudwatch_metric_alarm" "api_latency" {
  alarm_name          = "unbanked-${var.environment}-api-latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = var.evaluation_period
  metric_name        = "Duration"
  namespace          = "AWS/Lambda"
  period             = var.metric_period
  statistic          = "Average"
  threshold          = var.api_latency_threshold
  alarm_description  = "API latency exceeded threshold"

  dimensions = {
    Environment = var.environment
  }
}

# Datadog Monitoring
resource "datadog_monitor" "error_rate" {
  name    = "Unbanked ${var.environment} Error Rate"
  type    = "metric alert"
  query   = "sum(last_5m):sum:unbanked.errors{environment:${var.environment}} > ${var.error_rate_threshold}"
  message = "Error rate exceeded threshold. Please investigate."

  tags = [
    "environment:${var.environment}",
    "service:monitoring",
    "managed-by:terraform"
  ]
}

# Datadog Dashboard
resource "datadog_dashboard" "main_dashboard" {
  title       = "Unbanked ${var.environment} Overview"
  description = "Main monitoring dashboard for Unbanked platform"
  layout_type = "ordered"

  widget {
    name  = "API Latency"
    type  = "timeseries"
    query = "avg:aws.lambda.duration{environment:${var.environment}}"
  }

  widget {
    name  = "Error Rate"
    type  = "timeseries"
    query = "sum:unbanked.errors{environment:${var.environment}}.as_rate()"
  }
}

# Outputs
output "cloudwatch_log_groups" {
  description = "Map of CloudWatch log group names"
  value       = local.log_group_names
}

output "datadog_dashboard_url" {
  description = "URL of the created Datadog dashboard"
  value       = datadog_dashboard.main_dashboard.url
}