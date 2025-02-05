# VPC outputs for resource association and network isolation
output "vpc_id" {
  description = "ID of the created VPC for resource association and network isolation"
  value       = aws_vpc.main.id
}

output "vpc_cidr" {
  description = "CIDR block of the VPC for network planning and security group rules"
  value       = aws_vpc.main.cidr_block
}

# Subnet IDs for secure resource placement across availability zones
output "private_subnet_ids" {
  description = "List of private subnet IDs for secure application and database deployment"
  value       = aws_subnet.private[*].id
}

output "public_subnet_ids" {
  description = "List of public subnet IDs for load balancer and NAT gateway placement"
  value       = aws_subnet.public[*].id
}

# Network CIDR blocks for security group and routing configuration
output "private_subnet_cidrs" {
  description = "List of private subnet CIDR blocks for security group and routing configuration"
  value       = aws_subnet.private[*].cidr_block
}

output "public_subnet_cidrs" {
  description = "List of public subnet CIDR blocks for security group and routing configuration"
  value       = aws_subnet.public[*].cidr_block
}