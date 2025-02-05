# Output block for Redis cluster endpoints with sensitive information handling
output "redis_endpoints" {
  description = "Object containing all Redis cluster endpoints for application connectivity"
  value = {
    primary_endpoint       = aws_elasticache_replication_group.redis_cluster.primary_endpoint_address
    reader_endpoint        = aws_elasticache_replication_group.redis_cluster.reader_endpoint_address
    configuration_endpoint = aws_elasticache_replication_group.redis_cluster.configuration_endpoint_address
    port                  = aws_elasticache_replication_group.redis_cluster.port
  }
  sensitive = true # Marked sensitive to protect connection details
}

# Output block for Redis cluster configuration details
output "redis_configuration" {
  description = "Redis cluster configuration details for infrastructure management"
  value = {
    cluster_id             = aws_elasticache_replication_group.redis_cluster.id
    security_group_ids     = aws_elasticache_replication_group.redis_cluster.security_group_ids
    node_type             = aws_elasticache_replication_group.redis_cluster.node_type
    number_cache_clusters = aws_elasticache_replication_group.redis_cluster.number_cache_clusters
  }
  sensitive = false # Non-sensitive infrastructure details
}

# Output block for Redis security configuration
output "redis_security" {
  description = "Security-related configuration for the Redis cluster"
  value = {
    encryption_at_rest    = aws_elasticache_replication_group.redis_cluster.at_rest_encryption_enabled
    encryption_in_transit = aws_elasticache_replication_group.redis_cluster.transit_encryption_enabled
    auth_enabled         = aws_elasticache_replication_group.redis_cluster.auth_token != null
    subnet_group         = aws_elasticache_replication_group.redis_cluster.subnet_group_name
  }
  sensitive = true # Marked sensitive to protect security configuration
}