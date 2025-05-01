resource "google_compute_global_address" "alpha_testnet_full_node_ip" {
  name = "alpha-testnet-full-node-ip"

  lifecycle {
    prevent_destroy = true
  }
}

output "alpha_testnet_full_node_ip" {
  value = google_compute_global_address.alpha_testnet_full_node_ip.address
}
