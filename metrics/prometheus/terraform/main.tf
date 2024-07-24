terraform {
  backend "s3" {
    bucket = "aztec-terraform"
    region = "eu-west-2"
  }
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "3.74.2"
    }
  }
}

data "terraform_remote_state" "setup_iac" {
  backend = "s3"
  config = {
    bucket = "aztec-terraform"
    key    = "setup/setup-iac"
    region = "eu-west-2"
  }
}

data "terraform_remote_state" "aztec2_iac" {
  backend = "s3"
  config = {
    bucket = "aztec-terraform"
    key    = "aztec2/iac"
    region = "eu-west-2"
  }
}

provider "aws" {
  profile = "default"
  region  = "eu-west-2"
}

resource "aws_service_discovery_service" "prometheus" {
  name = "prometheus"

  health_check_custom_config {
    failure_threshold = 1
  }

  dns_config {
    namespace_id = data.terraform_remote_state.setup_iac.outputs.local_service_discovery_id

    dns_records {
      ttl  = 60
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }
}

# Configure an EFS filesystem.
resource "aws_efs_file_system" "prometheus_data_store" {
  creation_token = "prometheus-data-store"

  tags = {
    Name = "prometheus-data-store"
  }

  lifecycle_policy {
    transition_to_ia = "AFTER_14_DAYS"
  }
}

resource "aws_efs_mount_target" "private_az1" {
  file_system_id  = aws_efs_file_system.prometheus_data_store.id
  subnet_id       = data.terraform_remote_state.setup_iac.outputs.subnet_az1_private_id
  security_groups = [data.terraform_remote_state.setup_iac.outputs.security_group_private_id]
}

resource "aws_efs_mount_target" "private_az2" {
  file_system_id  = aws_efs_file_system.prometheus_data_store.id
  subnet_id       = data.terraform_remote_state.setup_iac.outputs.subnet_az2_private_id
  security_groups = [data.terraform_remote_state.setup_iac.outputs.security_group_private_id]
}

# Create role with EC2 read only access.
# data "aws_iam_policy_document" "ecs_task" {
#   statement {
#     effect  = "Allow"
#     actions = ["sts:AssumeRole"]

#     principals {
#       type        = "Service"
#       identifiers = ["ecs-tasks.amazonaws.com"]
#     }
#   }
# }

# resource "aws_iam_role" "prometheus_task_role" {
#   name               = "prometheus-task-role"
#   assume_role_policy = data.aws_iam_policy_document.ecs_task.json
# }

# resource "aws_iam_role_policy_attachment" "ec2_read_only_attachment" {
#   role       = aws_iam_role.prometheus_task_role.id
#   policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ReadOnlyAccess"
# }

# Define task definition and service.
resource "aws_ecs_task_definition" "prometheus" {
  family                   = "prometheus"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "2048"
  memory                   = "4096"
  execution_role_arn       = data.terraform_remote_state.setup_iac.outputs.ecs_task_execution_role_arn
  task_role_arn            = data.terraform_remote_state.aztec2_iac.outputs.cloudwatch_logging_ecs_role_arn

  volume {
    name = "prometheus-efs-data-store"
    efs_volume_configuration {
      file_system_id = aws_efs_file_system.prometheus_data_store.id
    }
  }

  container_definitions = <<DEFINITIONS
[
  {
    "name": "prometheus",
    "image": "${var.DOCKERHUB_ACCOUNT}/aztec-prometheus:latest",
    "essential": true,
    "memoryReservation": 256,
    "portMappings": [
      {
        "containerPort": 9090
      }
    ],
    "mountPoints": [
      {
        "containerPath": "/prometheus",
        "sourceVolume": "prometheus-efs-data-store"
      }
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/fargate/service/prometheus",
        "awslogs-region": "eu-west-2",
        "awslogs-stream-prefix": "ecs"
      }
    }
  }
]
DEFINITIONS
}

data "aws_ecs_task_definition" "prometheus" {
  task_definition = aws_ecs_task_definition.prometheus.family
}

resource "aws_ecs_service" "prometheus" {
  name                               = "prometheus"
  cluster                            = data.terraform_remote_state.setup_iac.outputs.ecs_cluster_id
  launch_type                        = "FARGATE"
  desired_count                      = "1"
  deployment_maximum_percent         = 100
  deployment_minimum_healthy_percent = 0
  platform_version                   = "1.4.0"

  network_configuration {
    subnets = [
      data.terraform_remote_state.setup_iac.outputs.subnet_az1_private_id,
      data.terraform_remote_state.setup_iac.outputs.subnet_az2_private_id
    ]
    security_groups = [data.terraform_remote_state.setup_iac.outputs.security_group_private_id]
  }

  service_registries {
    registry_arn = aws_service_discovery_service.prometheus.arn
  }

  task_definition = "${aws_ecs_task_definition.prometheus.family}:${max(aws_ecs_task_definition.prometheus.revision, data.aws_ecs_task_definition.prometheus.revision)}"
}

# Logs
resource "aws_cloudwatch_log_group" "prometheus_logs" {
  name              = "/fargate/service/prometheus"
  retention_in_days = "14"
}
