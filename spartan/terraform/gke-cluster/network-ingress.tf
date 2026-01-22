resource "google_compute_global_address" "staging_public_rpc_ip" {
  name        = "staging-public-rpc-ip"
  description = "Static IP for staging-public network RPC ingress"

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_compute_managed_ssl_certificate" "staging_public_rpc_cert" {
  name        = "staging-public-rpc-cert"
  description = "Managed SSL certificate for staging-public RPC ingress"

  managed {
    domains = ["staging.alpha-testnet.aztec-labs.com"]
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_compute_global_address" "testnet_rpc_ip" {
  name        = "testnet-rpc-ip"
  description = "Static IP for testnet RPC ingress"

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_compute_managed_ssl_certificate" "testnet_rpc_cert" {
  name        = "testnet-rpc-cert"
  description = "Managed SSL certificate for testnet RPC ingress"

  managed {
    domains = ["rpc.testnet.aztec-labs.com"]
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_compute_global_address" "devnet_rpc_ip" {
  name        = "devnet-rpc-ip"
  description = "Static IP for devnet network RPC ingress"

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_compute_managed_ssl_certificate" "devnet_rpc_cert" {
  name        = "devnet-rpc-cert"
  description = "Managed SSL certificate for devnet RPC ingress"

  managed {
    domains = ["devnet.aztec-labs.com"]
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_compute_global_address" "devnet_next_rpc_ip" {
  name        = "devnet-next-rpc-ip"
  description = "Static IP for devnet network RPC ingress"

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_compute_managed_ssl_certificate" "devnet_next_rpc_cert" {
  name        = "devnet-next-rpc-cert"
  description = "Managed SSL certificate for devnet RPC ingress"

  managed {
    domains = ["next.devnet.aztec-labs.com"]
  }

  lifecycle {
    prevent_destroy = true
  }
}

locals {
  devnet_offset = 6 # we've had 5 prior devnets. The sixth one is the first to use this format
}

resource "google_compute_global_address" "devnet_n_rpc_ip" {
  count       = 1
  name        = "devnet-${count.index + local.devnet_offset}-rpc-ip"
  description = "Static IP for devnet ${count.index + local.devnet_offset} network RPC ingress"

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_compute_managed_ssl_certificate" "devnet_n_rpc_cert" {
  count       = 1
  name        = "devnet-${count.index + local.devnet_offset}-rpc-cert"
  description = "Managed SSL certificate for devnet ${count.index + local.devnet_offset} RPC ingress"

  managed {
    domains = ["devnet-${count.index + local.devnet_offset}.aztec-labs.com"]
  }

  lifecycle {
    prevent_destroy = true
  }
}
