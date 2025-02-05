# Configure Terraform version and required providers
terraform {
  required_version = ">= 1.0"
  
  # Configure S3 backend for state management
  backend "s3" {
    bucket         = "unbanked-terraform-state-prod"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-state-lock-prod"
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

# Primary region provider configuration
provider "aws" {
  region = "us-east-1"
  alias  = "primary"

  default_tags {
    tags = {
      Environment       = "production"
      Project          = "Unbanked"
      ManagedBy        = "Terraform"
      CostCenter       = "PROD-001"
      DataClassification = "Confidential"
    }
  }
}

# Secondary region provider configuration for DR
provider "aws" {
  region = "us-west-2"
  alias  = "secondary"

  default_tags {
    tags = {
      Environment       = "production"
      Project          = "Unbanked"
      ManagedBy        = "Terraform"
      CostCenter       = "PROD-001"
      DataClassification = "Confidential"
    }
  }
}

# Production infrastructure module
module "unbanked_infrastructure" {
  source = "../../"

  # Environment configuration
  environment = "production"
  primary_region = "us-east-1"
  secondary_region = "us-west-2"
  vpc_cidr = "10.0.0.0/16"

  # Database configuration
  database_instance_class = "db.r6g.2xlarge"
  database_replica_count = 3
  database_backup_retention = 30

  # Redis configuration
  redis_node_type = "cache.r6g.xlarge"
  redis_cluster_size = 5

  # Monitoring configuration
  enable_monitoring = true
  enable_enhanced_monitoring = true
  enable_performance_insights = true

  # Security configuration
  waf_rules = {
    rate_limit = 10000
    ip_reputation_lists = true
    managed_rules = [
      "AWSManagedRulesCommonRuleSet",
      "AWSManagedRulesKnownBadInputsRuleSet"
    ]
  }

  ddos_protection = {
    shield_advanced = true
    network_firewall = true
  }

  # Backup configuration
  backup_config = {
    retention_days = 30
    cross_region_copy = true
    encryption = true
  }

  # Resource tagging
  tags = {
    Environment = "production"
    Project = "Unbanked"
    ManagedBy = "Terraform"
    CostCenter = "PROD-001"
    DataClassification = "Confidential"
  }
}

# Output VPC ID
output "vpc_id" {
  description = "Production VPC ID"
  value       = module.unbanked_infrastructure.vpc_id
}

# Output database endpoints
output "database_endpoints" {
  description = "Production database endpoints"
  value = {
    primary_endpoint = module.unbanked_infrastructure.database_endpoint
    reader_endpoint  = module.unbanked_infrastructure.database_reader_endpoint
  }
  sensitive = true
}

# Output Redis endpoints
output "redis_endpoints" {
  description = "Production Redis cluster endpoints"
  value = {
    primary_endpoint = module.unbanked_infrastructure.redis_endpoint
    reader_endpoints = module.unbanked_infrastructure.redis_reader_endpoints
  }
  sensitive = true
}

# Output monitoring endpoints
output "monitoring_endpoints" {
  description = "Production monitoring endpoints"
  value = {
    cloudwatch_dashboard = module.unbanked_infrastructure.monitoring_dashboard_url
    grafana_endpoint     = module.unbanked_infrastructure.grafana_endpoint
  }
}