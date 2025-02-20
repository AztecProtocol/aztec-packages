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
  source      = "../modules/ssh"
  ssh_user    = var.ssh_user
  secret_name = var.ssh_secret_name
}

module "iam" {
  source     = "../modules/iam"
  account_id = var.sa_account_id
}
