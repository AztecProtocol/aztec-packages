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

import {
  id = "projects/${var.project}/locations/${var.import_blockchain_node_region}/blockchainNodes/${var.import_blockchain_node_id}"
  to = google_blockchain_node_engine_blockchain_nodes.eth_sepolia_3
}

resource "google_blockchain_node_engine_blockchain_nodes" "eth_sepolia_3" {
  location           = var.import_blockchain_node_region
  blockchain_node_id = var.import_blockchain_node_id
  blockchain_type    = "ETHEREUM"
  ethereum_details {
    api_enable_admin = false
    api_enable_debug = false
    consensus_client = "LIGHTHOUSE"
    execution_client = "GETH"
    network          = "TESTNET_SEPOLIA"
    node_type        = "FULL"
  }
}
