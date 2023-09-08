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


resource "aws_cloudwatch_log_group" "aztec_node_log_group" {
  name              = "/fargate/service/${var.DEPLOY_TAG}/aztec-node"
  retention_in_days = 14
}

resource "aws_service_discovery_service" "aztec-node" {
  name = "${var.DEPLOY_TAG}-aztec-node"

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
resource "aws_ecs_task_definition" "aztec-node" {
  family                   = "${var.DEPLOY_TAG}-aztec-node"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "2048"
  memory                   = "4096"
  execution_role_arn       = data.terraform_remote_state.setup_iac.outputs.ecs_task_execution_role_arn
  task_role_arn            = data.terraform_remote_state.aztec2_iac.outputs.cloudwatch_logging_ecs_role_arn

  container_definitions = <<DEFINITIONS
[
  {
    "name": "${var.DEPLOY_TAG}-aztec-node",
    "image": "philwindle/aztec-node:latest",
    "essential": true,
    "memoryReservation": 3776,
    "portMappings": [
      {
        "containerPort": 80
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
        "value": "https://aztec-connect-testnet-eth-host.aztec.network:8545/6cc8f5cd170abccfc090c6cf51d50ec7"
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
        "name": "SEQ_PUBLISHER_PRIVATE_KEY",
        "value": "caaff87b825d9fa6f7842a8da5caa48465fbe591f66d8ebf6e898c4d7d04fd64"
      },
      {
        "name": "CONTRACT_DEPLOYMENT_EMITTER_ADDRESS",
        "value": "0x257aaba71ee7331ef795d4b5b8b7dd3e726952a7"
      },
      {
        "name": "ROLLUP_CONTRACT_ADDRESS",
        "value": "0x2590e3d09cf6a798e09710821f58900fb9296e35"
      },
      {
        "name": "INBOX_CONTRACT_ADDRESS",
        "value": "0x11ce1c4a6a7b1dec321cca9c30a3537bebb4c29d"
      },
      {
        "name": "API_KEY",
        "value": "6cc8f5cd170abccfc090c6cf51d50ec7"
      },
      {
        "name": "API_PREFIX",
        "value": "/${var.DEPLOY_TAG}/aztec-node"
      },
      {
        "name": "SEARCH_START_BLOCK",
        "value": "15918000"
      },
      {
        "name": "P2P_TCP_LISTEN_PORT",
        "value": "40401"
      },
      {
        "name": "P2P_ENABLED",
        "value": "false"
      },
      {
        "name": "BOOTSTRAP_NODES",
        "value": "/ip4/44.201.46.76/tcp/40400/p2p/12D3KooWGBpbC6qQFkaCYphjNeY6sV99o4SnEWyTeBigoVriDn4D"
      }
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/fargate/service/${var.DEPLOY_TAG}/aztec-node",
        "awslogs-region": "eu-west-2",
        "awslogs-stream-prefix": "ecs"
      }
    }
  }
]
DEFINITIONS
}

resource "aws_ecs_service" "aztec-node" {
  name                               = "${var.DEPLOY_TAG}-aztec-node"
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
    target_group_arn = aws_alb_target_group.aztec-node.arn
    container_name   = "${var.DEPLOY_TAG}-aztec-node"
    container_port   = 80
  }

  service_registries {
    registry_arn   = aws_service_discovery_service.aztec-node.arn
    container_name = "${var.DEPLOY_TAG}-aztec-node"
    container_port = 80
  }

  task_definition = aws_ecs_task_definition.aztec-node.family
}

# Configure ALB to route /aztec-node to server.
resource "aws_alb_target_group" "aztec-node" {
  name                 = "${var.DEPLOY_TAG}-aztec-node"
  port                 = "80"
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = data.terraform_remote_state.setup_iac.outputs.vpc_id
  deregistration_delay = 5

  health_check {
    path                = "/${var.DEPLOY_TAG}/aztec-node"
    matcher             = "200"
    interval            = 10
    healthy_threshold   = 2
    unhealthy_threshold = 5
    timeout             = 5
  }

  tags = {
    name = "${var.DEPLOY_TAG}-aztec-node"
  }
}

resource "aws_lb_listener_rule" "api" {
  listener_arn = data.terraform_remote_state.aztec2_iac.outputs.alb_listener_arn
  priority     = 500

  action {
    type             = "forward"
    target_group_arn = aws_alb_target_group.aztec-node.arn
  }

  condition {
    path_pattern {
      values = ["/${var.DEPLOY_TAG}/aztec-node*"]
    }
  }
}
