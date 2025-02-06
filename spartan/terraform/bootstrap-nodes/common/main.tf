terraform {
  backend "gcs" {
    bucket = "aztec-terraform"
    prefix = "bootnode/common"
  }
}
provider "google" {
  project = var.project_id
  region  = "us-west1"
}

module "vm_sa" {
  source     = "./../iam"
  project_id = var.project_id
}

module "ssh_key" {
  source      = "./../ssh"
  ssh_user    = var.ssh_user
  secret_name = var.ssh_key_secret_name
}


