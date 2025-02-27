terraform {
  backend "gcs" {
    bucket = "aztec-terraform"
  }
}
provider "aws" {
  region = "eu-west-2"
}

module "vpc" {
  source  = "../../modules/vpc/aws"
  regions = var.regions
}

module "iam" {
  source     = "../../modules/iam/aws"
  account_id = var.sa_account_id
}

module "firewall" {
  source        = "../../modules/firewall/aws"
  p2p_tcp_ports = var.p2p_tcp_ports
  p2p_udp_ports = var.p2p_udp_ports
  vpc_ids       = module.vpc.vpc_ids_by_region
}
