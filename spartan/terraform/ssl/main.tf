terraform {
  backend "gcs" {
    bucket = "aztec-terraform"
    prefix = "ssl/terraform.tfstate"
  }
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project
  region  = var.region
}

