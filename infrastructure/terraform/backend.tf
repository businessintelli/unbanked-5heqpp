# Backend configuration for Unbanked platform infrastructure state management
# Version: 1.5.0 (Terraform)
# Purpose: Manages infrastructure state with encrypted S3 storage and DynamoDB locking

terraform {
  backend "s3" {
    # Environment-specific state bucket with encryption
    bucket = "unbanked-terraform-state-${var.environment}"
    key    = "${var.environment}/terraform.tfstate"
    region = "us-east-1"

    # Enable server-side encryption using AWS KMS
    encrypt = true

    # DynamoDB table for state locking
    dynamodb_table = "unbanked-terraform-locks-${var.environment}"

    # Access control settings
    acl = "private"

    # Performance and consistency settings
    force_path_style = false
    kms_key_id      = "alias/unbanked-terraform-state-key"

    # Versioning and lifecycle settings
    versioning = true

    # Additional security settings
    sse_algorithm = "aws:kms"
    
    # State operation timeouts
    skip_credentials_validation = false
    skip_region_validation     = false
    skip_metadata_api_check    = false
  }

  # Required provider versions
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Minimum required Terraform version
  required_version = ">= 1.5.0"
}

# Backend configuration validation
locals {
  # Ensure environment variable is set
  validate_environment = var.environment != "" ? null : file("ERROR: environment variable must be set")

  # Validate bucket naming convention
  validate_bucket_name = can(regex("^unbanked-terraform-state-(production|staging)$", 
    "unbanked-terraform-state-${var.environment}")) ? null : file("ERROR: invalid bucket name format")
}