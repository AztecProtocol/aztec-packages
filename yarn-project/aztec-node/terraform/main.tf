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


resource "aws_cloudwatch_log_group" "aztec-node-log-group-1" {
  name              = "/fargate/service/${var.DEPLOY_TAG}/aztec-node-1"
  retention_in_days = 14
}

resource "aws_service_discovery_service" "aztec-node-1" {
  name = "${var.DEPLOY_TAG}-aztec-node-1"

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

# Define task definition and service.
resource "aws_ecs_task_definition" "aztec-node-1" {
  family                   = "${var.DEPLOY_TAG}-aztec-node-1"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "2048"
  memory                   = "4096"
  execution_role_arn       = data.terraform_remote_state.setup_iac.outputs.ecs_task_execution_role_arn
  task_role_arn            = data.terraform_remote_state.aztec2_iac.outputs.cloudwatch_logging_ecs_role_arn

  container_definitions = <<DEFINITIONS
[
  {
    "name": "${var.DEPLOY_TAG}-aztec-node-1",
    "image": "philwindle/aztec-node:latest",
    "essential": true,
    "memoryReservation": 3776,
    "portMappings": [
      {
        "containerPort": 80
      },
      {
        "containerPort": ${var.NODE_1_TCP_PORT}
      }
    ],
    "environment": [
      {
        "name": "NODE_ENV",
        "value": "production"
      },
      {
        "name": "AZTEC_NODE_PORT",
        "value": "80"
      },
      {
        "name": "DEBUG",
        "value": "aztec:*"
      },
      {
        "name": "ETHEREUM_HOST",
        "value": "testnet"
      },
      {
        "name": "ARCHIVER_POLLING_INTERVAL",
        "value": "10000"
      },
      {
        "name": "SEQ_RETRY_INTERVAL",
        "value": "10000"
      },
      {
        "name": "SEQ_MAX_TX_PER_BLOCK",
        "value": "32"
      },
      {
        "name": "SEQ_MIN_TX_PER_BLOCK",
        "value": "4"
      },
      {
        "name": "SEQ_PUBLISHER_PRIVATE_KEY",
        "value": "${var.SEQ_1_PUBLISHER_PRIVATE_KEY}"
      },
      {
        "name": "CONTRACT_DEPLOYMENT_EMITTER_ADDRESS",
        "value": "${var.CONTRACT_DEPLOYMENT_EMITTER_ADDRESS}"
      },
      {
        "name": "ROLLUP_CONTRACT_ADDRESS",
        "value": "${var.ROLLUP_CONTRACT_ADDRESS}"
      },
      {
        "name": "INBOX_CONTRACT_ADDRESS",
        "value": "${var.INBOX_CONTRACT_ADDRESS}"
      },
      {
        "name": "API_KEY",
        "value": "${var.API_KEY}"
      },
      {
        "name": "API_PREFIX",
        "value": "/${var.DEPLOY_TAG}/aztec-node-1"
      },
      {
        "name": "SEARCH_START_BLOCK",
        "value": "15918000"
      },
      {
        "name": "P2P_TCP_LISTEN_PORT",
        "value": "${var.NODE_1_TCP_PORT}"
      },
      {
        "name": "P2P_TCP_LISTEN_IP",
        "value": "0.0.0.0"
      },
      {
        "name": "BOOTSTRAP_NODES",
        "value": "/dns4/aztec-dev-aztec-bootstrap-2.local/tcp/${var.BOOTNODE_2_LISTEN_PORT}/p2p/16Uiu2HAmKFSy5uJAAkTQ7H58UMMZYpCAS3tfSoqS3fv7edPbZiQ8,/dns4/aztec-dev-aztec-bootstrap-1.local/tcp/${var.BOOTNODE_1_LISTEN_PORT}/p2p/16Uiu2HAmB3pbHurrEoUDSv9cXqUG9hFPA3u8zvLZJfTpRaJKeYot"
      },
      {
        "name": "P2P_ENABLED",
        "value": "true"
      },
      {
        "name": "CHAIN_ID",
        "value": "${var.CHAIN_ID}"
      }
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/fargate/service/${var.DEPLOY_TAG}/aztec-node-1",
        "awslogs-region": "eu-west-2",
        "awslogs-stream-prefix": "ecs"
      }
    }
  }
]
DEFINITIONS
}

resource "aws_ecs_service" "aztec-node-1" {
  name                               = "${var.DEPLOY_TAG}-aztec-node-1"
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

  load_balancer {
    target_group_arn = aws_alb_target_group.aztec-node-1.arn
    container_name   = "${var.DEPLOY_TAG}-aztec-node-1"
    container_port   = 80
  }

  service_registries {
    registry_arn   = aws_service_discovery_service.aztec-node-1.arn
    container_name = "${var.DEPLOY_TAG}-aztec-node-1"
    container_port = 80
  }

  task_definition = aws_ecs_task_definition.aztec-node-1.family
}

# Configure ALB to route /aztec-node to server.
resource "aws_alb_target_group" "aztec-node-1" {
  name                 = "${var.DEPLOY_TAG}-aztec-node-1"
  port                 = "80"
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = data.terraform_remote_state.setup_iac.outputs.vpc_id
  deregistration_delay = 5

  health_check {
    path                = "/${var.DEPLOY_TAG}/aztec-node-1/status"
    matcher             = "200"
    interval            = 10
    healthy_threshold   = 2
    unhealthy_threshold = 5
    timeout             = 5
  }

  tags = {
    name = "${var.DEPLOY_TAG}-aztec-node-1"
  }
}

resource "aws_lb_listener_rule" "api-1" {
  listener_arn = data.terraform_remote_state.aztec2_iac.outputs.alb_listener_arn
  priority     = 500

  action {
    type             = "forward"
    target_group_arn = aws_alb_target_group.aztec-node-1.arn
  }

  condition {
    path_pattern {
      values = ["/${var.DEPLOY_TAG}/aztec-node-1*"]
    }
  }
}

resource "aws_cloudwatch_log_group" "aztec-node-log-group-2" {
  name              = "/fargate/service/${var.DEPLOY_TAG}/aztec-node-2"
  retention_in_days = 14
}

resource "aws_service_discovery_service" "aztec-node-2" {
  name = "${var.DEPLOY_TAG}-aztec-node-2"

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

# Define task definition and service.
resource "aws_ecs_task_definition" "aztec-node-2" {
  family                   = "${var.DEPLOY_TAG}-aztec-node-2"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "2048"
  memory                   = "4096"
  execution_role_arn       = data.terraform_remote_state.setup_iac.outputs.ecs_task_execution_role_arn
  task_role_arn            = data.terraform_remote_state.aztec2_iac.outputs.cloudwatch_logging_ecs_role_arn

  container_definitions = <<DEFINITIONS
[
  {
    "name": "${var.DEPLOY_TAG}-aztec-node-2",
    "image": "philwindle/aztec-node:latest",
    "essential": true,
    "memoryReservation": 3776,
    "portMappings": [
      {
        "containerPort": 80
      },
      {
        "containerPort": ${var.NODE_2_TCP_PORT}
      }
    ],
    "environment": [
      {
        "name": "NODE_ENV",
        "value": "production"
      },
      {
        "name": "SERVER_PORT",
        "value": "80"
      },
      {
        "name": "DEBUG",
        "value": "aztec:*"
      },
      {
        "name": "ETHEREUM_HOST",
        "value": "testnet"
      },
      {
        "name": "ARCHIVER_POLLING_INTERVAL",
        "value": "10000"
      },
      {
        "name": "SEQ_RETRY_INTERVAL",
        "value": "10000"
      },
      {
        "name": "SEQ_MAX_TX_PER_BLOCK",
        "value": "32"
      },
      {
        "name": "SEQ_MIN_TX_PER_BLOCK",
        "value": "4"
      },
      {
        "name": "SEQ_PUBLISHER_PRIVATE_KEY",
        "value": "${var.SEQ_2_PUBLISHER_PRIVATE_KEY}"
      },
      {
        "name": "CONTRACT_DEPLOYMENT_EMITTER_ADDRESS",
        "value": "${var.CONTRACT_DEPLOYMENT_EMITTER_ADDRESS}"
      },
      {
        "name": "ROLLUP_CONTRACT_ADDRESS",
        "value": "${var.ROLLUP_CONTRACT_ADDRESS}"
      },
      {
        "name": "INBOX_CONTRACT_ADDRESS",
        "value": "${var.INBOX_CONTRACT_ADDRESS}"
      },
      {
        "name": "API_KEY",
        "value": "${var.API_KEY}"
      },
      {
        "name": "API_PREFIX",
        "value": "/${var.DEPLOY_TAG}/aztec-node-2"
      },
      {
        "name": "SEARCH_START_BLOCK",
        "value": "15918000"
      },
      {
        "name": "P2P_TCP_LISTEN_PORT",
        "value": "${var.NODE_2_TCP_PORT}"
      },
      {
        "name": "P2P_TCP_LISTEN_IP",
        "value": "0.0.0.0"
      },
      {
        "name": "BOOTSTRAP_NODES",
        "value": "/dns4/aztec-dev-aztec-bootstrap-2.local/tcp/${var.BOOTNODE_2_LISTEN_PORT}/p2p/16Uiu2HAmKFSy5uJAAkTQ7H58UMMZYpCAS3tfSoqS3fv7edPbZiQ8,/dns4/aztec-dev-aztec-bootstrap-1.local/tcp/${var.BOOTNODE_1_LISTEN_PORT}/p2p/16Uiu2HAmB3pbHurrEoUDSv9cXqUG9hFPA3u8zvLZJfTpRaJKeYot"
      },
      {
        "name": "P2P_ENABLED",
        "value": "true"
      },
      {
        "name": "CHAIN_ID",
        "value": "${var.CHAIN_ID}"
      }
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/fargate/service/${var.DEPLOY_TAG}/aztec-node-2",
        "awslogs-region": "eu-west-2",
        "awslogs-stream-prefix": "ecs"
      }
    }
  }
]
DEFINITIONS
}

resource "aws_ecs_service" "aztec-node-2" {
  name                               = "${var.DEPLOY_TAG}-aztec-node-2"
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

  load_balancer {
    target_group_arn = aws_alb_target_group.aztec-node-2.arn
    container_name   = "${var.DEPLOY_TAG}-aztec-node-2"
    container_port   = 80
  }

  service_registries {
    registry_arn   = aws_service_discovery_service.aztec-node-2.arn
    container_name = "${var.DEPLOY_TAG}-aztec-node-2"
    container_port = 80
  }

  task_definition = aws_ecs_task_definition.aztec-node-2.family
}

# Configure ALB to route /aztec-node to server.
resource "aws_alb_target_group" "aztec-node-2" {
  name                 = "${var.DEPLOY_TAG}-aztec-node-2"
  port                 = "80"
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = data.terraform_remote_state.setup_iac.outputs.vpc_id
  deregistration_delay = 5

  health_check {
    path                = "/${var.DEPLOY_TAG}/aztec-node-2/status"
    matcher             = "200"
    interval            = 10
    healthy_threshold   = 2
    unhealthy_threshold = 5
    timeout             = 5
  }

  tags = {
    name = "${var.DEPLOY_TAG}-aztec-node-2"
  }
}

resource "aws_lb_listener_rule" "api-2" {
  listener_arn = data.terraform_remote_state.aztec2_iac.outputs.alb_listener_arn
  priority     = 501

  action {
    type             = "forward"
    target_group_arn = aws_alb_target_group.aztec-node-2.arn
  }

  condition {
    path_pattern {
      values = ["/${var.DEPLOY_TAG}/aztec-node-2*"]
    }
  }
}
