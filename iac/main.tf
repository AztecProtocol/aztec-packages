terraform {
  backend "s3" {
    bucket = "aztec-terraform"
    key    = "aztec-network/iac"
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

provider "aws" {
  profile = "default"
  region  = "eu-west-2"
}

# Create our load balancer.
resource "aws_lb" "aztec-network" {
  name               = "aztec-network"
  internal           = false
  load_balancer_type = "network"
  security_groups = [
    data.terraform_remote_state.setup_iac.outputs.security_group_public_id
  ]
  subnets = [
    data.terraform_remote_state.setup_iac.outputs.subnet_az1_id,
    data.terraform_remote_state.setup_iac.outputs.subnet_az2_id
  ]

  access_logs {
    bucket  = "aztec-logs"
    prefix  = "aztec-network-nlb-logs"
    enabled = false
  }

  tags = {
    Name = "aztec-network"
  }
}
