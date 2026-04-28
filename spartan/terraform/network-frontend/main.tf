terraform {
  backend "gcs" {
    bucket = "aztec-terraform"
    # prefix is set per-network via `terraform init -backend-config="prefix=..."`
    # convention: terraform/state/network-frontend/<NAMESPACE>
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

resource "google_compute_global_address" "rpc_ip" {
  name        = "${var.NAMESPACE}-rpc-ip"
  description = "Static IP for ${var.NAMESPACE} RPC ingress"

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_compute_managed_ssl_certificate" "rpc_cert" {
  name        = "${var.NAMESPACE}-rpc-cert"
  description = "Managed SSL certificate for ${var.NAMESPACE} RPC ingress"

  managed {
    domains = var.RPC_HOSTNAMES
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_dns_record_set" "rpc_a" {
  for_each = var.CREATE_DNS ? toset(var.RPC_HOSTNAMES) : toset([])

  managed_zone = var.DNS_ZONE_NAME
  name         = "${each.value}."
  type         = "A"
  ttl          = 300
  rrdatas      = [google_compute_global_address.rpc_ip.address]
}
