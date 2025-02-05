# AWS Provider version ~> 4.0

# Basic deployment information
output "environment" {
  description = "Deployment environment name"
  value       = var.environment
  sensitive   = false
}

output "region" {
  description = "AWS region where resources are deployed"
  value       = var.region
  sensitive   = false
}

# Database endpoints and connection information
output "database_primary_endpoint" {
  description = "Primary database endpoint for application connections"
  value       = aws_db_instance.primary.endpoint
  sensitive   = true
}

output "database_read_endpoints" {
  description = "List of read replica endpoints for high availability"
  value       = aws_db_instance.replicas[*].endpoint
  sensitive   = true
}

output "database_connection_string" {
  description = "Full database connection string with credentials"
  value       = "postgresql://${aws_db_instance.primary.username}:${aws_db_instance.primary.password}@${aws_db_instance.primary.endpoint}/${aws_db_instance.primary.name}"
  sensitive   = true
}

# Redis cache endpoints
output "redis_primary_endpoint" {
  description = "Primary Redis endpoint for caching"
  value       = aws_elasticache_cluster.primary.cache_nodes[0].address
  sensitive   = true
}

output "redis_read_endpoints" {
  description = "List of Redis read endpoints"
  value       = aws_elasticache_cluster.replicas[*].cache_nodes[0].address
  sensitive   = true
}

# Network configuration
output "vpc_id" {
  description = "VPC ID where resources are deployed"
  value       = aws_vpc.main.id
  sensitive   = false
}

output "private_subnet_ids" {
  description = "List of private subnet IDs"
  value       = aws_subnet.private[*].id
  sensitive   = false
}

output "public_subnet_ids" {
  description = "List of public subnet IDs"
  value       = aws_subnet.public[*].id
  sensitive   = false
}

# Security groups
output "security_group_ids" {
  description = "Map of security group IDs by purpose"
  value = {
    database    = aws_security_group.database.id
    cache       = aws_security_group.cache.id
    application = aws_security_group.application.id
  }
  sensitive = false
}

# KMS keys
output "kms_key_arns" {
  description = "Map of KMS key ARNs by purpose"
  value = {
    database    = aws_kms_key.database.arn
    storage     = aws_kms_key.storage.arn
    application = aws_kms_key.application.arn
  }
  sensitive = true
}

# IAM roles
output "iam_role_arns" {
  description = "Map of IAM role ARNs by purpose"
  value = {
    edge_functions = aws_iam_role.edge_functions.arn
    application   = aws_iam_role.application.arn
    monitoring    = aws_iam_role.monitoring.arn
  }
  sensitive = false
}

# Load balancer
output "load_balancer_dns" {
  description = "Application load balancer DNS name"
  value       = aws_lb.application.dns_name
  sensitive   = false
}

# Storage buckets
output "storage_buckets" {
  description = "Map of storage bucket names by purpose"
  value = {
    documents = aws_s3_bucket.documents.id
    backups   = aws_s3_bucket.backups.id
    logs      = aws_s3_bucket.logs.id
  }
  sensitive = false
}

# Edge function URLs
output "edge_function_urls" {
  description = "Map of edge function URLs by service"
  value = {
    auth    = aws_lambda_function_url.auth.url
    banking = aws_lambda_function_url.banking.url
    crypto  = aws_lambda_function_url.crypto.url
  }
  sensitive = false
}