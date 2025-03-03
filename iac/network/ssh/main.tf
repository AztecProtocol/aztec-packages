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
  source      = "../modules/ssh/gcp"
  ssh_user    = var.ssh_user
  secret_name = var.ssh_secret_name
}
