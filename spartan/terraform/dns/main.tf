terraform {
  backend "gcs" {
    bucket = "aztec-terraform"
    prefix = "terraform/state/dns"
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

resource "google_dns_managed_zone" "rpc" {
  name        = "rpc-aztec-labs-com"
  dns_name    = "rpc.aztec-labs.com."
  description = "Delegated zone for Aztec RPC endpoints."
  visibility  = "public"

  lifecycle {
    prevent_destroy = true
  }
}
