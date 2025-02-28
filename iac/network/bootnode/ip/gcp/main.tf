terraform {
  backend "gcs" {
    bucket = "aztec-terraform"
  }
}

provider "google" {
  project = var.project_id
  region  = "us-west1"
}


module "ip" {
  source  = "../../../modules/ip/gcp"
  regions = var.regions
  name    = var.name
}
