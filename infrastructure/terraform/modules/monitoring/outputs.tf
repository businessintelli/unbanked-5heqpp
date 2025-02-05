# Output definitions for monitoring resources
# Provider versions:
# AWS Provider ~> 5.0
# Datadog Provider ~> 3.0

# CloudWatch Log Groups output
output "cloudwatch_log_groups" {
  description = "Map of CloudWatch log group names for application and security logs with retention settings"
  value       = {
    application = aws_cloudwatch_log_group.application_logs.name
    security    = aws_cloudwatch_log_group.security_logs.name
  }
}

# CloudWatch Metric Alarms output
output "cloudwatch_metric_alarms" {
  description = "Map of CloudWatch metric alarm ARNs for system monitoring"
  value       = {
    api_latency = aws_cloudwatch_metric_alarm.api_latency.arn
    error_rate  = aws_cloudwatch_metric_alarm.error_rate.arn
  }
}

# Datadog Dashboard URL output
output "datadog_dashboard_url" {
  description = "URL of the Datadog dashboard for comprehensive system monitoring and visualization"
  value       = datadog_dashboard.main_dashboard.url
}

# Datadog Monitor ID output
output "datadog_monitor_id" {
  description = "ID of the Datadog monitor for error rate tracking and alerting"
  value       = datadog_monitor.error_rate.id
}

# Monitoring Tags output
output "monitoring_tags" {
  description = "Common tags applied to all monitoring resources for consistent resource tracking"
  value       = {
    environment = var.environment
    service     = "monitoring"
    managed_by  = "terraform"
  }
}