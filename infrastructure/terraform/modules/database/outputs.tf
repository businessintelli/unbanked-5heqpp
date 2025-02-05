# Primary database connection information
output "primary_db_endpoint" {
  description = "Endpoint URL for the primary PostgreSQL database instance"
  value       = aws_db_instance.unbanked_primary.endpoint
}

output "primary_db_address" {
  description = "DNS address of the primary PostgreSQL database instance"
  value       = aws_db_instance.unbanked_primary.address
}

output "primary_db_port" {
  description = "Port number on which the primary PostgreSQL database instance accepts connections"
  value       = aws_db_instance.unbanked_primary.port
}

# Read replica connection information
output "read_replica_endpoints" {
  description = "List of endpoint URLs for all PostgreSQL read replica instances"
  value       = [for replica in aws_db_instance.unbanked_replica : replica.endpoint]
}

output "read_replica_addresses" {
  description = "List of DNS addresses for all PostgreSQL read replica instances"
  value       = [for replica in aws_db_instance.unbanked_replica : replica.address]
}

# Database configuration
output "database_name" {
  description = "Name of the created PostgreSQL database"
  value       = aws_db_instance.unbanked_primary.db_name
}

output "database_credentials" {
  description = "Master credentials for the PostgreSQL database"
  sensitive   = true
  value = {
    username = aws_db_instance.unbanked_primary.username
    password = random_password.db_password.result
  }
}

# Deployment information
output "replica_count" {
  description = "Number of active read replicas"
  value       = length(aws_db_instance.unbanked_replica)
}