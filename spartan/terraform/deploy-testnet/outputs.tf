output "node_rpc_url" {
  description = "RPC endpoint"
  value       = "https://${var.RPC_HOSTNAME}"
}

output "ingress_ip" {
  description = "Ingress IP address"
  value       = google_compute_global_address.rpc_ingress_ip.address
}

