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

data "terraform_remote_state" "aztec2_iac" {
  backend = "s3"
  config = {
    bucket = "aztec-terraform"
    key    = "aztec2/iac"
    region = "eu-west-2"
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

resource "aws_cloudwatch_log_group" "aztec-proof-verifier-log-group" {
  name              = "/fargate/service/${var.DEPLOY_TAG}/aztec-proof-verifier"
  retention_in_days = 14
}

resource "aws_service_discovery_service" "aztec-proof-verifier" {
  name = "${var.DEPLOY_TAG}-aztec-proof-verifier"

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

# Create a fleet.
data "template_file" "user_data" {
  template = <<EOF
#!/bin/bash
echo ECS_CLUSTER=${data.terraform_remote_state.setup_iac.outputs.ecs_cluster_name} >> /etc/ecs/ecs.config
echo 'ECS_INSTANCE_ATTRIBUTES={"group": "${var.DEPLOY_TAG}-proof-verifier"}' >> /etc/ecs/ecs.config
EOF
}

resource "aws_launch_template" "proof_verifier_launch_template" {
  name                   = "${var.DEPLOY_TAG}-pf-launch-template"
  image_id               = "ami-0cd4858f2b923aa6b"
  instance_type          = "m4.2xlarge" // 8 cores, 32 GB
  vpc_security_group_ids = [data.terraform_remote_state.setup_iac.outputs.security_group_private_id]

  iam_instance_profile {
    name = data.terraform_remote_state.setup_iac.outputs.ecs_instance_profile_name
  }

  key_name = data.terraform_remote_state.setup_iac.outputs.ecs_instance_key_pair_name

  user_data = base64encode(data.template_file.user_data.rendered)

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name       = "${var.DEPLOY_TAG}-proof-verifier"
      prometheus = ""
    }
  }
}

resource "aws_ec2_fleet" "proof_verifier_fleet" {
  launch_template_config {
    launch_template_specification {
      launch_template_id = aws_launch_template.proof_verifier_launch_template.id
      version            = aws_launch_template.proof_verifier_launch_template.latest_version
    }

    override {
      subnet_id         = data.terraform_remote_state.setup_iac.outputs.subnet_az1_private_id
      availability_zone = "eu-west-2a"
      max_price         = "0.15"
    }

    override {
      subnet_id         = data.terraform_remote_state.setup_iac.outputs.subnet_az2_private_id
      availability_zone = "eu-west-2b"
      max_price         = "0.15"
    }
  }

  target_capacity_specification {
    default_target_capacity_type = "on-demand"
    total_target_capacity        = 1
    spot_target_capacity         = 0
    on_demand_target_capacity    = 1
  }

  terminate_instances                 = true
  terminate_instances_with_expiration = true
}

resource "aws_ecs_task_definition" "aztec-proof-verifier" {
  family                   = "${var.DEPLOY_TAG}-aztec-proof-verifier"
  network_mode             = "awsvpc"
  requires_compatibilities = ["EC2"]
  execution_role_arn       = data.terraform_remote_state.setup_iac.outputs.ecs_task_execution_role_arn
  task_role_arn            = data.terraform_remote_state.aztec2_iac.outputs.cloudwatch_logging_ecs_role_arn

  container_definitions = jsonencode([
    {
      name              = "${var.DEPLOY_TAG}-aztec-proof-verifier"
      image             = "${var.DOCKERHUB_ACCOUNT}/aztec:${var.DEPLOY_TAG}"
      command           = ["start", "--proof-verifier"]
      essential         = true
      cpu               = 8192
      memoryReservation = 30720
      portMappings = [
        {
          containerPort = 80
        }
      ]
      environment = [
        { name = "PROOF_VERIFIER_L1_START_BLOCK", value = "15918000" },
        { name = "PROOF_VERIFIER_POLL_INTERVAL_MS", value = tostring(var.PROOF_VERIFIER_POLL_INTERVAL_MS) },
        { name = "ETHEREUM_HOSTS", value = var.ETHEREUM_HOSTS },
        { name = "L1_CHAIN_ID", value = tostring(var.L1_CHAIN_ID) },
        { name = "ROLLUP_CONTRACT_ADDRESS", value = var.ROLLUP_CONTRACT_ADDRESS },
        {
          name  = "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT"
          value = "http://aztec-otel.local:4318/v1/metrics"
        },
        {
          name  = "OTEL_SERVICE_NAME"
          value = "${var.DEPLOY_TAG}-aztec-proof-verifier"
        },
        { name = "LOG_LEVEL", value = var.LOG_LEVEL },
        { name = "NETWORK", value = var.DEPLOY_TAG },
        { name = "LOG_JSON", value = "1" }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.aztec-proof-verifier-log-group.name
          "awslogs-region"        = "eu-west-2"
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "aztec-proof-verifier" {
  name                               = "${var.DEPLOY_TAG}-aztec-proof-verifier"
  cluster                            = data.terraform_remote_state.setup_iac.outputs.ecs_cluster_id
  launch_type                        = "EC2"
  desired_count                      = 1
  deployment_maximum_percent         = 100
  deployment_minimum_healthy_percent = 0
  force_new_deployment               = true
  enable_execute_command             = true

  network_configuration {
    subnets = [
      data.terraform_remote_state.setup_iac.outputs.subnet_az1_private_id,
      data.terraform_remote_state.setup_iac.outputs.subnet_az2_private_id
    ]
    security_groups = [data.terraform_remote_state.setup_iac.outputs.security_group_private_id]
  }

  # load_balancer {
  #   target_group_arn = aws_alb_target_group.bot_http.arn
  #   container_name   = "${var.DEPLOY_TAG}-aztec-proof-verifier"
  #   container_port   = 80
  # }

  service_registries {
    registry_arn   = aws_service_discovery_service.aztec-proof-verifier.arn
    container_name = "${var.DEPLOY_TAG}-aztec-proof-verifier"
    container_port = 80
  }

  placement_constraints {
    type       = "memberOf"
    expression = "attribute:group == ${var.DEPLOY_TAG}-proof-verifier"
  }

  task_definition = aws_ecs_task_definition.aztec-proof-verifier.family
}
