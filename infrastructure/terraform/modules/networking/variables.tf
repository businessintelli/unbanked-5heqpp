# Environment variable with strict validation for allowed values
variable "environment" {
  description = "Environment name for resource naming and tagging (e.g., production, staging, development)"
  type        = string
  
  validation {
    condition     = can(regex("^(production|staging|development)$", var.environment))
    error_message = "Environment must be production, staging, or development"
  }
}

# VPC CIDR block variable with validation for valid IPv4 CIDR format
variable "vpc_cidr" {
  description = "CIDR block for the VPC network address space (e.g., 10.0.0.0/16)"
  type        = string
  
  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "VPC CIDR must be a valid IPv4 CIDR block"
  }
}

# Availability zones variable with validation for high availability requirements
variable "availability_zones" {
  description = "Number of availability zones to use for high availability (2-3)"
  type        = number
  default     = 3
  
  validation {
    condition     = var.availability_zones >= 2 && var.availability_zones <= 3
    error_message = "Number of availability zones must be 2 or 3 for high availability"
  }
}

# Private subnet tagging variable for resource organization
variable "private_subnet_tags" {
  description = "Additional tags for private subnets for resource organization and cost allocation"
  type        = map(string)
  default     = {}
}

# Public subnet tagging variable for resource organization
variable "public_subnet_tags" {
  description = "Additional tags for public subnets for resource organization and cost allocation"
  type        = map(string)
  default     = {}
}

# NAT Gateway enablement variable for private subnet internet access
variable "enable_nat_gateway" {
  description = "Enable NAT Gateway for private subnet internet access"
  type        = bool
  default     = true
}

# Single NAT Gateway variable for cost optimization in non-production environments
variable "single_nat_gateway" {
  description = "Use a single NAT Gateway for all private subnets (cost optimization for non-production)"
  type        = bool
  default     = false
}