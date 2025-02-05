# Provider configuration
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

# Local variables for resource naming
locals {
  db_identifier         = "unbanked-${var.environment}"
  parameter_group_name  = "unbanked-pg-${var.environment}"
  subnet_group_name     = "unbanked-subnet-${var.environment}"
  monitoring_role_name  = "unbanked-monitoring-${var.environment}"
}

# Generate secure random password for database
resource "random_password" "db_password" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# Create DB subnet group
resource "aws_db_subnet_group" "unbanked" {
  name       = local.subnet_group_name
  subnet_ids = var.subnet_ids
  tags       = var.tags
}

# Create IAM role for enhanced monitoring
resource "aws_iam_role" "monitoring_role" {
  name = local.monitoring_role_name

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

# Attach enhanced monitoring policy to role
resource "aws_iam_role_policy_attachment" "monitoring_policy" {
  role       = aws_iam_role.monitoring_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# Create parameter group for PostgreSQL optimization
resource "aws_db_parameter_group" "unbanked" {
  family = var.parameter_group_family
  name   = local.parameter_group_name

  parameter {
    name  = "shared_buffers"
    value = "{DBInstanceClassMemory/4096}MB"
  }

  parameter {
    name  = "max_connections"
    value = "1000"
  }

  parameter {
    name  = "work_mem"
    value = "64MB"
  }

  parameter {
    name  = "maintenance_work_mem"
    value = "256MB"
  }

  parameter {
    name  = "effective_cache_size"
    value = "{DBInstanceClassMemory/2048}MB"
  }

  parameter {
    name  = "ssl"
    value = "1"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  parameter {
    name  = "autovacuum"
    value = "1"
  }

  tags = var.tags
}

# Create primary PostgreSQL instance
resource "aws_db_instance" "unbanked_primary" {
  identifier = local.db_identifier
  
  # Engine configuration
  engine         = "postgres"
  engine_version = "15.4"
  instance_class = var.instance_class
  
  # Storage configuration
  allocated_storage     = var.storage_size
  storage_type         = "gp3"
  storage_encrypted    = var.enable_encryption
  
  # Database configuration
  db_name  = var.database_name
  username = "unbanked_admin"
  password = random_password.db_password.result
  
  # Network configuration
  db_subnet_group_name   = aws_db_subnet_group.unbanked.name
  vpc_security_group_ids = var.vpc_security_group_ids
  multi_az              = var.multi_az
  
  # Parameter and option groups
  parameter_group_name = aws_db_parameter_group.unbanked.name
  
  # Backup configuration
  backup_retention_period = var.backup_retention_days
  backup_window          = "03:00-04:00"
  maintenance_window     = "Mon:04:00-Mon:05:00"
  
  # Monitoring configuration
  performance_insights_enabled          = true
  performance_insights_retention_period = 7
  monitoring_interval                   = 60
  monitoring_role_arn                  = aws_iam_role.monitoring_role.arn
  enabled_cloudwatch_logs_exports      = ["postgresql", "upgrade"]
  
  # Additional settings
  auto_minor_version_upgrade = true
  deletion_protection       = true
  skip_final_snapshot      = false
  final_snapshot_identifier = "${local.db_identifier}-final-snapshot"
  copy_tags_to_snapshot    = true
  
  tags = var.tags
}

# Create read replicas
resource "aws_db_instance" "unbanked_replica" {
  count = var.replica_count

  identifier = "${local.db_identifier}-replica-${count.index + 1}"
  
  # Replica configuration
  replicate_source_db = aws_db_instance.unbanked_primary.id
  instance_class     = var.instance_class
  
  # Network configuration
  vpc_security_group_ids = var.vpc_security_group_ids
  
  # Parameter group
  parameter_group_name = aws_db_parameter_group.unbanked.name
  
  # Monitoring configuration
  performance_insights_enabled          = true
  performance_insights_retention_period = 7
  monitoring_interval                   = 60
  monitoring_role_arn                  = aws_iam_role.monitoring_role.arn
  
  # Additional settings
  auto_minor_version_upgrade = true
  copy_tags_to_snapshot     = true
  
  tags = var.tags
}

# Create CloudWatch alarms for monitoring
resource "aws_cloudwatch_metric_alarm" "database_cpu" {
  alarm_name          = "${local.db_identifier}-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name        = "CPUUtilization"
  namespace          = "AWS/RDS"
  period             = "300"
  statistic          = "Average"
  threshold          = "80"
  alarm_description  = "This metric monitors database CPU utilization"
  alarm_actions      = []  # Add SNS topic ARN for notifications

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.unbanked_primary.id
  }
}

resource "aws_cloudwatch_metric_alarm" "database_memory" {
  alarm_name          = "${local.db_identifier}-low-memory"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "2"
  metric_name        = "FreeableMemory"
  namespace          = "AWS/RDS"
  period             = "300"
  statistic          = "Average"
  threshold          = "1000000000"  # 1GB in bytes
  alarm_description  = "This metric monitors database freeable memory"
  alarm_actions      = []  # Add SNS topic ARN for notifications

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.unbanked_primary.id
  }
}