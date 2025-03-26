terraform {
  backend "gcs" {
    bucket = "aztec-terraform"
    prefix = "terraform/state/gke-cluster"
  }
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

# Configure the Google Cloud provider
provider "google" {
  project = var.project
  region  = var.region
}

module "gke_cluster_private" {
  source = "./cluster"

  cluster_name    = "aztec-gke-private"
  project         = var.project
  region          = var.region
  zone            = var.zone
  service_account = google_service_account.gke_sa.email
}

module "gke_cluster_public" {
  source = "./cluster"

  cluster_name    = "aztec-gke-public"
  project         = var.project
  region          = var.region
  zone            = var.zone
  service_account = google_service_account.gke_sa.email
}
