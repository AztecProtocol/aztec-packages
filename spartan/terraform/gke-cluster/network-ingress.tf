resource "google_compute_global_address" "staging_public_rpc_ip" {
  name        = "staging-rc-1-ingress"
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

# TODO: enable these resources once testnet is migrated to use deploy_network.sh

#resource "google_compute_global_address" "testnet_rpc_ip" {
#  name        = "testnet-rpc-ingress"
#  description = "Static IP for testnet RPC ingress"
#
#  lifecycle {
#    prevent_destroy = true
#  }
#}
#
#resource "google_compute_managed_ssl_certificate" "testnet_rpc_cert" {
#  name        = "testnet-rpc-cert"
#  description = "Managed SSL certificate for testnet RPC ingress"
#
#  managed {
#    domains = ["rpc.testnet.aztec-labs.com"]
#  }
#
#  lifecycle {
#    prevent_destroy = true
#  }
#}
