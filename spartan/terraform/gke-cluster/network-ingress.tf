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

resource "google_compute_global_address" "nextnet_rpc_ip" {
  name        = "nextnet-rpc-ip"
  description = "Static IP for nextnet RPC ingress"

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_compute_managed_ssl_certificate" "nextnet_rpc_cert" {
  name        = "nextnet-rpc-cert"
  description = "Managed SSL certificate for nextnet RPC ingress"

  managed {
    domains = ["nextnet.aztec-labs.com"]
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
  devnet_offset = 6 # deprecated. Naming has changed

  devnets = [
    "v4-devnet-3"
  ]
}

# deprecated
resource "google_compute_global_address" "devnet_n_rpc_ip" {
  count       = 1
  name        = "devnet-${count.index + local.devnet_offset}-rpc-ip"
  description = "Static IP for devnet ${count.index + local.devnet_offset} network RPC ingress"
}

# deprecated
resource "google_compute_managed_ssl_certificate" "devnet_n_rpc_cert" {
  count       = 1
  name        = "devnet-${count.index + local.devnet_offset}-rpc-cert"
  description = "Managed SSL certificate for devnet ${count.index + local.devnet_offset} RPC ingress"

  managed {
    domains = ["devnet-${count.index + local.devnet_offset}.aztec-labs.com"]
  }
}

resource "google_compute_global_address" "devnet_network_rpc_ip" {
  for_each    = toset(local.devnets)
  name        = "${each.key}-rpc-ip"
  description = "Static IP for ${each.key} RPC ingress"
}

resource "google_compute_managed_ssl_certificate" "devnet_network_rpc_cert" {
  for_each    = toset(local.devnets)
  name        = "${each.key}-rpc-cert"
  description = "Managed SSL certificate for ${each.key} RPC ingress"

  managed {
    domains = ["${each.key}.aztec-labs.com"]
  }
}
