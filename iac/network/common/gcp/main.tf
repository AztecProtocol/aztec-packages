terraform {
  backend "gcs" {
    bucket = "aztec-terraform"
  }
}
provider "google" {
  project = var.project_id
  region  = "us-west1"
}


module "iam" {
  source     = "../../modules/iam/gcp"
  account_id = var.sa_account_id
  project_id = var.project_id
}

module "firewall" {
  source    = "../../modules/firewall/gcp"
  p2p_ports = var.p2p_ports
}
