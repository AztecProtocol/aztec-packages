terraform {
  backend "gcs" {
    bucket = "aztec-terraform"
  }
}
provider "google" {
  project = var.project_id
  region  = "us-west1"
}


module "ssh" {
  source      = "../../modules/ssh/gcp"
  ssh_user    = var.ssh_user
  secret_name = var.ssh_secret_name
}

module "iam" {
  source     = "../../modules/iam/gcp"
  account_id = var.sa_account_id
}

module "firewall" {
  source        = "../../modules/firewall/gcp"
  p2p_tcp_ports = var.p2p_tcp_ports
  p2p_udp_ports = var.p2p_udp_ports
}
