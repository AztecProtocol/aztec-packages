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

# Define provider and region
provider "aws" {
  region = "eu-west-2"
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


resource "aws_cloudwatch_log_group" "aztec_bootstrap_log_group" {
  name              = "/fargate/service/${var.DEPLOY_TAG}/aztec-bootstrap"
  retention_in_days = 14
}

resource "aws_service_discovery_service" "aztec-bootstrap" {
  name = "${var.DEPLOY_TAG}-aztec-bootstrap"

  health_check_custom_config {
    failure_threshold = 1
  }

  dns_config {
    namespace_id = data.terraform_remote_state.setup_iac.outputs.local_service_discovery_id

    dns_records {
      ttl  = 60
      type = "A"
    }

    dns_records {
      ttl  = 60
      type = "SRV"
    }

    routing_policy = "MULTIVALUE"
  }

  # Terraform just fails if this resource changes and you have registered instances.
  provisioner "local-exec" {
    when    = destroy
    command = "${path.module}/../servicediscovery-drain.sh ${self.id}"
  }
}

# Define task definition and service for the first p2p bootnode
resource "aws_ecs_task_definition" "aztec-bootstrap" {
  family                   = "${var.DEPLOY_TAG}-aztec-bootstrap"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "2048"
  memory                   = "4096"
  execution_role_arn       = data.terraform_remote_state.setup_iac.outputs.ecs_task_execution_role_arn
  task_role_arn            = data.terraform_remote_state.aztec2_iac.outputs.cloudwatch_logging_ecs_role_arn

  container_definitions = <<DEFINITIONS
[
  {
    "name": "${var.DEPLOY_TAG}-aztec-bootstrap-1",
    "image": "philwindle/p2p-bootstrap:latest",
    "essential": true,
    "command": ["start"],
    "memoryReservation": 2048,
    "portMappings": [
      {
        "containerPort": ${var.BOOTNODE_1_LISTEN_PORT},
        "hostPort": ${var.BOOTNODE_1_LISTEN_PORT}
      }
    ],
    "environment": [
      {
        "name": "NODE_ENV",
        "value": "production"
      },
      {
        "name": "P2P_TCP_LISTEN_PORT",
        "value": "${var.BOOTNODE_1_LISTEN_PORT}"
      },
      {
        "name": "P2P_TCP_LISTEN_IP",
        "value": "0.0.0.0"
      },
      {
        "name": "PEER_ID_PRIVATE_KEY",
        "value": "${var.BOOTNODE_1_PRIVATE_KEY}"
      },
      {
        "name": "DEBUG",
        "value": "aztec:*"
      }
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/fargate/service/${var.DEPLOY_TAG}/aztec-bootstrap",
        "awslogs-region": "eu-west-2",
        "awslogs-stream-prefix": "ecs"
      }
    }
  },
  {
    "name": "${var.DEPLOY_TAG}-aztec-bootstrap-2",
    "image": "philwindle/p2p-bootstrap:latest",
    "essential": true,
    "command": ["start"],
    "memoryReservation": 2048,
    "portMappings": [
      {
        "containerPort": ${var.BOOTNODE_2_LISTEN_PORT},
        "hostport": ${var.BOOTNODE_2_LISTEN_PORT}
      }
    ],
    "environment": [
      {
        "name": "NODE_ENV",
        "value": "production"
      },
      {
        "name": "P2P_TCP_LISTEN_PORT",
        "value": "${var.BOOTNODE_2_LISTEN_PORT}"
      },
      {
        "name": "P2P_TCP_LISTEN_IP",
        "value": "0.0.0.0"
      },
      {
        "name": "PEER_ID_PRIVATE_KEY",
        "value": "${var.BOOTNODE_2_PRIVATE_KEY}"
      },
      {
        "name": "DEBUG",
        "value": "aztec:*"
      }
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/fargate/service/${var.DEPLOY_TAG}/aztec-bootstrap",
        "awslogs-region": "eu-west-2",
        "awslogs-stream-prefix": "ecs"
      }
    }
  }
]
DEFINITIONS
}

resource "aws_ecs_service" "aztec-bootstrap" {
  name                               = "${var.DEPLOY_TAG}-aztec-bootstrap"
  cluster                            = data.terraform_remote_state.setup_iac.outputs.ecs_cluster_id
  launch_type                        = "FARGATE"
  desired_count                      = 1
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
    registry_arn   = aws_service_discovery_service.aztec-bootstrap.arn
    container_name = "${var.DEPLOY_TAG}-aztec-bootstrap"
  }

  task_definition = aws_ecs_task_definition.aztec-bootstrap.family
}
