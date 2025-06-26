output "node_rpc_url" {
  description = "Aztec RPC endpoint"
  value       = "https://${var.HOSTNAME}"
}

output "ingress_ip" {
  description = "Ingress IP address"
  value       = google_compute_global_address.ingress.address
}

