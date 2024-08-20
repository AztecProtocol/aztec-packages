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

data "terraform_remote_state" "aztec-network_iac" {
  backend = "s3"
  config = {
    bucket = "aztec-terraform"
    key    = "aztec-network/iac"
    region = "eu-west-2"
  }
}

data "terraform_remote_state" "l1_contracts" {
  backend = "s3"
  config = {
    bucket = "aztec-terraform"
    key    = "${var.DEPLOY_TAG}/l1-contracts"
    region = "eu-west-2"
  }
}

# Compute local variables
locals {
  prover_private_keys   = var.PROVER_PRIVATE_KEYS
  node_p2p_private_keys = var.NODE_P2P_PRIVATE_KEYS
  node_count            = length(local.prover_private_keys)
  data_dir              = "/usr/src/yarn-project/aztec"
}

output "node_count" {
  value = local.node_count
}

resource "aws_cloudwatch_log_group" "aztec-prover-node-log-group" {
  count             = local.node_count
  name              = "/fargate/service/${var.DEPLOY_TAG}/aztec-prover-node-${count.index + 1}"
  retention_in_days = 14
}

resource "aws_service_discovery_service" "aztec-prover-node" {
  count = local.node_count
  name  = "${var.DEPLOY_TAG}-aztec-prover-node-${count.index + 1}"

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

# Configure an EFS filesystem.
resource "aws_efs_file_system" "prover_node_data_store" {
  creation_token                  = "${var.DEPLOY_TAG}-prover-node-data"
  throughput_mode                 = "provisioned"
  provisioned_throughput_in_mibps = 20

  tags = {
    Name = "${var.DEPLOY_TAG}-prover-node-data"
  }

  lifecycle_policy {
    transition_to_ia = "AFTER_14_DAYS"
  }
}

resource "aws_efs_mount_target" "public_az1" {
  file_system_id  = aws_efs_file_system.prover_node_data_store.id
  subnet_id       = data.terraform_remote_state.setup_iac.outputs.subnet_az1_id
  security_groups = [data.terraform_remote_state.setup_iac.outputs.security_group_public_id]
}

resource "aws_efs_mount_target" "public_az2" {
  file_system_id  = aws_efs_file_system.prover_node_data_store.id
  subnet_id       = data.terraform_remote_state.setup_iac.outputs.subnet_az2_id
  security_groups = [data.terraform_remote_state.setup_iac.outputs.security_group_public_id]
}

# Define task definitions for each node.
resource "aws_ecs_task_definition" "aztec-prover-node" {
  count                    = local.node_count
  family                   = "${var.DEPLOY_TAG}-aztec-prover-node-${count.index + 1}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "2048"
  memory                   = "4096"
  execution_role_arn       = data.terraform_remote_state.setup_iac.outputs.ecs_task_execution_role_arn
  task_role_arn            = data.terraform_remote_state.aztec2_iac.outputs.cloudwatch_logging_ecs_role_arn

  volume {
    name = "efs-data-store"
    efs_volume_configuration {
      root_directory = "/"
      file_system_id = aws_efs_file_system.prover_node_data_store.id
    }
  }

  container_definitions = jsonencode([
    {
      name              = "${var.DEPLOY_TAG}-aztec-prover-node-${count.index + 1}"
      image             = "${var.DOCKERHUB_ACCOUNT}/aztec:${var.IMAGE_TAG}"
      command           = ["start", "--prover-node", "--archiver"]
      essential         = true
      memoryReservation = 3776
      portMappings = [
        {
          containerPort = 80
        },
        {
          containerPort = var.NODE_P2P_TCP_PORT + count.index
          protocol      = "tcp"
        },
        {
          containerPort = var.NODE_P2P_UDP_PORT + count.index
          protocol      = "udp"
        }
      ]
      environment = [
        // General
        { name = "NODE_ENV", value = "production" },
        { name = "LOG_LEVEL", value = "verbose" },
        { name = "DEBUG", value = "aztec:*,-json-rpc:json_proxy:*,-aztec:avm_simulator:*" },
        { name = "DEPLOY_TAG", value = var.DEPLOY_TAG },
        { name = "NETWORK_NAME", value = "${var.DEPLOY_TAG}" },
        { name = "ETHEREUM_HOST", value = "https://${var.DEPLOY_TAG}-mainnet-fork.aztec.network:8545/${var.API_KEY}" },
        { name = "L1_CHAIN_ID", value = var.L1_CHAIN_ID },
        { name = "DATA_DIRECTORY", value = "${local.data_dir}/prover_node_${count.index + 1}/data" },
        { name = "DEPLOY_AZTEC_CONTRACTS", value = "false" },
        { name = "IS_DEV_NET", value = "true" },

        // API
        { name = "AZTEC_PORT", value = "80" },
        { name = "API_KEY", value = var.API_KEY },
        { name = "API_PREFIX", value = "/${var.DEPLOY_TAG}/aztec-prover-node-${count.index + 1}/${var.API_KEY}" },

        // Archiver
        { name = "ARCHIVER_POLLING_INTERVAL", value = "10000" },

        // Aztec node to pull clientivc proofs from (to be replaced with a p2p connection)
        { name = "TX_PROVIDER_NODE_URL", value = "http://${var.DEPLOY_TAG}-aztec-node-${count.index + 1}.local/${var.DEPLOY_TAG}/aztec-node-${count.index + 1}/${var.API_KEY}" },

        // Prover
        { name = "PROVER_PUBLISHER_PRIVATE_KEY", value = local.prover_private_keys[count.index] },
        { name = "PROVER_AGENT_ENABLED", value = "false" },
        { name = "PROVER_AGENT_CONCURRENCY", value = "0" },
        { name = "PROVER_REAL_PROOFS", value = tostring(var.PROVING_ENABLED) },
        { name = "BB_WORKING_DIRECTORY", value = "${local.data_dir}/prover_node_${count.index + 1}/temp" },
        { name = "ACVM_WORKING_DIRECTORY", value = "${local.data_dir}/prover_node_${count.index + 1}/temp" },
        { name = "PROVER_NODE_MAX_PENDING_JOBS", value = tostring(var.PROVER_NODE_MAX_PENDING_JOBS) },

        // Metrics
        { name = "OTEL_EXPORTER_OTLP_ENDPOINT", value = "http://aztec-otel.local:4318" },
        { name = "OTEL_SERVICE_NAME", value = "${var.DEPLOY_TAG}-aztec-prover-node-${count.index + 1}" },

        // L1 addresses
        { name = "ROLLUP_CONTRACT_ADDRESS", value = data.terraform_remote_state.l1_contracts.outputs.rollup_contract_address },
        { name = "INBOX_CONTRACT_ADDRESS", value = data.terraform_remote_state.l1_contracts.outputs.inbox_contract_address },
        { name = "OUTBOX_CONTRACT_ADDRESS", value = data.terraform_remote_state.l1_contracts.outputs.outbox_contract_address },
        { name = "REGISTRY_CONTRACT_ADDRESS", value = data.terraform_remote_state.l1_contracts.outputs.registry_contract_address },
        { name = "AVAILABILITY_ORACLE_CONTRACT_ADDRESS", value = data.terraform_remote_state.l1_contracts.outputs.availability_oracle_contract_address },
        { name = "FEE_JUICE_CONTRACT_ADDRESS", value = data.terraform_remote_state.l1_contracts.outputs.fee_juice_contract_address },
        { name = "FEE_JUICE_PORTAL_CONTRACT_ADDRESS", value = data.terraform_remote_state.l1_contracts.outputs.FEE_JUICE_PORTAL_CONTRACT_ADDRESS },

        // P2P (disabled)
        { name = "P2P_ENABLED", value = tostring(var.P2P_ENABLED) },
        { name = "BOOTSTRAP_NODES", value = var.BOOTSTRAP_NODES },
        { name = "PEER_ID_PRIVATE_KEY", value = local.node_p2p_private_keys[count.index] },
        { name = "P2P_TCP_LISTEN_ADDR", value = "0.0.0.0:${var.NODE_P2P_TCP_PORT + count.index}" },
        { name = "P2P_UDP_LISTEN_ADDR", value = "0.0.0.0:${var.NODE_P2P_UDP_PORT + count.index}" },
        { name = "P2P_TCP_ANNOUNCE_ADDR", value = ":${var.NODE_P2P_TCP_PORT + count.index}" },
        { name = "P2P_UDP_ANNOUNCE_ADDR", value = ":${var.NODE_P2P_UDP_PORT + count.index}" },
        { name = "P2P_QUERY_FOR_IP", value = "true" },
        { name = "P2P_MIN_PEERS", value = var.P2P_MIN_PEERS },
        { name = "P2P_MAX_PEERS", value = var.P2P_MAX_PEERS },
        { name = "P2P_BLOCK_CHECK_INTERVAL_MS", value = "1000" },
        { name = "P2P_PEER_CHECK_INTERVAL_MS", value = "2000" },
        { name = "P2P_TX_POOL_KEEP_PROVEN_FOR", value = tostring(var.P2P_TX_POOL_KEEP_PROVEN_FOR) },
      ]
      mountPoints = [
        {
          containerPath = "${local.data_dir}/prover_node_${count.index + 1}"
          sourceVolume  = "efs-data-store"
        }
      ]
      dependsOn = [
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = "/fargate/service/${var.DEPLOY_TAG}/aztec-prover-node-${count.index + 1}"
          "awslogs-region"        = "eu-west-2"
          "awslogs-stream-prefix" = "ecs"
        }
      }
  }])
}

resource "aws_ecs_service" "aztec-prover-node" {
  count                              = local.node_count
  name                               = "${var.DEPLOY_TAG}-aztec-prover-node-${count.index + 1}"
  cluster                            = data.terraform_remote_state.setup_iac.outputs.ecs_cluster_id
  launch_type                        = "FARGATE"
  desired_count                      = 1
  deployment_maximum_percent         = 100
  deployment_minimum_healthy_percent = 0
  platform_version                   = "1.4.0"
  force_new_deployment               = true
  enable_execute_command             = true

  network_configuration {
    assign_public_ip = true
    subnets = [
      data.terraform_remote_state.setup_iac.outputs.subnet_az1_id
    ]
    security_groups = [data.terraform_remote_state.aztec-network_iac.outputs.p2p_security_group_id, data.terraform_remote_state.setup_iac.outputs.security_group_private_id]
  }

  load_balancer {
    target_group_arn = aws_alb_target_group.aztec-prover-node-http[count.index].arn
    container_name   = "${var.DEPLOY_TAG}-aztec-prover-node-${count.index + 1}"
    container_port   = 80
  }

  service_registries {
    registry_arn   = aws_service_discovery_service.aztec-prover-node[count.index].arn
    container_name = "${var.DEPLOY_TAG}-aztec-prover-node-${count.index + 1}"
    container_port = 80
  }

  task_definition = aws_ecs_task_definition.aztec-prover-node[count.index].family
}

# Configure ALB to route /aztec-prover-node to server.
resource "aws_alb_target_group" "aztec-prover-node-http" {
  count                = local.node_count
  name                 = "${var.DEPLOY_TAG}-prover-${count.index + 1}-target"
  port                 = 80
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = data.terraform_remote_state.setup_iac.outputs.vpc_id
  deregistration_delay = 5

  health_check {
    path                = "/${var.DEPLOY_TAG}/aztec-prover-node-${count.index + 1}/${var.API_KEY}/status"
    matcher             = "200"
    interval            = 10
    healthy_threshold   = 2
    unhealthy_threshold = 5
    timeout             = 5
  }

  tags = {
    name = "${var.DEPLOY_TAG}-aztec-prover-node-${count.index + 1}"
  }
}

resource "aws_lb_listener_rule" "api" {
  count        = local.node_count
  listener_arn = data.terraform_remote_state.aztec2_iac.outputs.alb_listener_arn
  priority     = var.PROVER_NODE_LB_RULE_PRIORITY + count.index

  action {
    type             = "forward"
    target_group_arn = aws_alb_target_group.aztec-prover-node-http[count.index].arn
  }

  condition {
    path_pattern {
      values = ["/${var.DEPLOY_TAG}/aztec-prover-node-${count.index + 1}/${var.API_KEY}*"]
    }
  }
}

# resource "aws_security_group_rule" "allow-node-tcp-in" {
#   count             = local.node_count
#   type              = "ingress"
#   from_port         = var.NODE_P2P_TCP_PORT + count.index
#   to_port           = var.NODE_P2P_TCP_PORT + count.index
#   protocol          = "tcp"
#   cidr_blocks       = ["0.0.0.0/0"]
#   security_group_id = data.terraform_remote_state.aztec-network_iac.outputs.p2p_security_group_id
# }

# resource "aws_security_group_rule" "allow-node-tcp-out" {
#   count             = local.node_count
#   type              = "egress"
#   from_port         = var.NODE_P2P_TCP_PORT + count.index
#   to_port           = var.NODE_P2P_TCP_PORT + count.index
#   protocol          = "tcp"
#   cidr_blocks       = ["0.0.0.0/0"]
#   security_group_id = data.terraform_remote_state.aztec-network_iac.outputs.p2p_security_group_id
# }

# resource "aws_security_group_rule" "allow-node-udp-in" {
#   count             = local.node_count
#   type              = "ingress"
#   from_port         = var.NODE_P2P_UDP_PORT
#   to_port           = var.NODE_P2P_UDP_PORT + count.index
#   protocol          = "udp"
#   cidr_blocks       = ["0.0.0.0/0"]
#   security_group_id = data.terraform_remote_state.aztec-network_iac.outputs.p2p_security_group_id
# }

# resource "aws_security_group_rule" "allow-node-udp-out" {
#   count             = local.node_count
#   type              = "egress"
#   from_port         = var.NODE_P2P_UDP_PORT
#   to_port           = var.NODE_P2P_UDP_PORT + count.index
#   protocol          = "udp"
#   cidr_blocks       = ["0.0.0.0/0"]
#   security_group_id = data.terraform_remote_state.aztec-network_iac.outputs.p2p_security_group_id
# }
