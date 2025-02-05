# AWS Provider configuration with version constraint for security patches
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Local variables for consistent resource naming and tagging
locals {
  name_prefix = "${var.environment}-unbanked"
  common_tags = {
    Environment   = var.environment
    Project      = "unbanked"
    ManagedBy    = "terraform"
    SecurityZone = "network"
    CreatedAt    = timestamp()
  }
}

# Data source for available AWS Availability Zones with opt-in validation
data "aws_availability_zones" "available" {
  state = "available"
  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

# Main VPC resource with enhanced monitoring and protection
resource "aws_vpc" "main" {
  cidr_block                           = var.vpc_cidr
  enable_dns_hostnames                 = true
  enable_dns_support                   = true
  enable_network_address_usage_metrics = true

  tags = merge(local.common_tags, {
    Name         = "${local.name_prefix}-vpc"
    NetworkTier  = "core"
  })

  lifecycle {
    prevent_destroy = true
  }
}

# Private subnets with enhanced tagging and protection
resource "aws_subnet" "private" {
  count             = var.availability_zones
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index)
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = merge(local.common_tags, var.private_subnet_tags, {
    Name         = "${local.name_prefix}-private-${count.index + 1}"
    NetworkTier  = "private"
    AZ           = data.aws_availability_zones.available.names[count.index]
  })

  lifecycle {
    prevent_destroy = true
  }
}

# Public subnets with enhanced security configuration
resource "aws_subnet" "public" {
  count                   = var.availability_zones
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, var.availability_zones + count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = merge(local.common_tags, var.public_subnet_tags, {
    Name         = "${local.name_prefix}-public-${count.index + 1}"
    NetworkTier  = "public"
    AZ           = data.aws_availability_zones.available.names[count.index]
  })

  lifecycle {
    prevent_destroy = true
  }
}

# Internet Gateway for public subnet internet access
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-igw"
  })

  lifecycle {
    prevent_destroy = true
  }
}

# NAT Gateways for private subnet internet access
resource "aws_nat_gateway" "main" {
  count         = var.enable_nat_gateway ? (var.single_nat_gateway ? 1 : var.availability_zones) : 0
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-nat-${count.index + 1}"
  })

  depends_on = [aws_internet_gateway.main]
}

# Elastic IPs for NAT Gateways
resource "aws_eip" "nat" {
  count  = var.enable_nat_gateway ? (var.single_nat_gateway ? 1 : var.availability_zones) : 0
  domain = "vpc"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-eip-${count.index + 1}"
  })

  lifecycle {
    prevent_destroy = true
  }
}

# Route table for public subnets
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = merge(local.common_tags, {
    Name        = "${local.name_prefix}-rt-public"
    NetworkTier = "public"
  })

  lifecycle {
    prevent_destroy = true
  }
}

# Route tables for private subnets
resource "aws_route_table" "private" {
  count  = var.enable_nat_gateway ? var.availability_zones : 0
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = var.single_nat_gateway ? aws_nat_gateway.main[0].id : aws_nat_gateway.main[count.index].id
  }

  tags = merge(local.common_tags, {
    Name        = "${local.name_prefix}-rt-private-${count.index + 1}"
    NetworkTier = "private"
    AZ          = data.aws_availability_zones.available.names[count.index]
  })

  lifecycle {
    prevent_destroy = true
  }
}

# Associate public subnets with public route table
resource "aws_route_table_association" "public" {
  count          = var.availability_zones
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Associate private subnets with corresponding private route tables
resource "aws_route_table_association" "private" {
  count          = var.enable_nat_gateway ? var.availability_zones : 0
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# VPC Flow Logs for network monitoring and security
resource "aws_flow_log" "main" {
  vpc_id                   = aws_vpc.main.id
  traffic_type            = "ALL"
  max_aggregation_interval = 60
  log_destination_type    = "cloud-watch-logs"
  log_destination        = aws_cloudwatch_log_group.flow_logs.arn
  iam_role_arn           = aws_iam_role.flow_logs.arn

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-flow-logs"
  })
}

# CloudWatch Log Group for VPC Flow Logs
resource "aws_cloudwatch_log_group" "flow_logs" {
  name              = "/aws/vpc/flow-logs/${local.name_prefix}"
  retention_in_days = 30

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-flow-logs"
  })
}

# IAM Role for VPC Flow Logs
resource "aws_iam_role" "flow_logs" {
  name = "${local.name_prefix}-flow-logs-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "vpc-flow-logs.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

# IAM Role Policy for VPC Flow Logs
resource "aws_iam_role_policy" "flow_logs" {
  name = "${local.name_prefix}-flow-logs-policy"
  role = aws_iam_role.flow_logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams"
        ]
        Resource = "${aws_cloudwatch_log_group.flow_logs.arn}:*"
      }
    ]
  })
}