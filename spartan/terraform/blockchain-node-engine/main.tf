terraform {
  backend "gcs" {
    bucket = "aztec-terraform"
    prefix = "terraform/state/blockchain-node-engine"
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

import {
  id = "projects/${var.project}/locations/${var.import_blockchain_node_region}/blockchainNodes/${var.import_blockchain_node_id}"
  to = google_blockchain_node_engine_blockchain_nodes.default
}

resource "google_blockchain_node_engine_blockchain_nodes" "default" {
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
