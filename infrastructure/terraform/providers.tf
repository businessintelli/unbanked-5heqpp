# Configure Terraform version and required providers
terraform {
  required_version = ">= 1.0"

  required_providers {
    # AWS Provider v5.0+ for infrastructure management
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }

    # Random Provider v3.0+ for secure identifier generation
    random = {
      source  = "hashicorp/aws"
      version = "~> 3.0"
    }
  }
}

# Configure AWS Provider with secure defaults and proper authentication
provider "aws" {
  region = var.region

  # Default tags applied to all resources
  default_tags {
    Project             = "Unbanked"
    Environment         = var.environment
    ManagedBy          = "Terraform"
    SecurityCompliance  = "GDPR,PSD2"
    DataClassification = "Sensitive"
  }

  # Assume role configuration for secure access
  assume_role {
    role_arn     = var.aws_role_arn
    session_name = "UnbankedTerraform"
  }

  # Security defaults
  default_security_group_rules = {
    ingress = []
    egress  = []
  }

  # S3 defaults
  s3_force_path_style         = false
  s3_use_path_style          = false
  skip_requesting_account_id  = false
  skip_credentials_validation = false
  skip_metadata_api_check     = false
  skip_region_validation     = false
}

# Configure Random Provider for generating secure unique identifiers
provider "random" {
  # Using default configuration as no specific settings are required
}