output "eth_execution_ip" {
  description = "Static IP address for Ethereum execution client"
  value       = google_compute_address.eth_execution_ip.address
}

output "eth_beacon_ip" {
  description = "Static IP address for Ethereum beacon client"
  value       = google_compute_address.eth_beacon_ip.address
}

output "eth_execution_rpc_url" {
  description = "Ethereum execution RPC URL"
  value       = "http://${google_compute_address.eth_execution_ip.address}:8545"
}

output "eth_execution_ws_url" {
  description = "Ethereum execution WebSocket URL"
  value       = "ws://${google_compute_address.eth_execution_ip.address}:8546"
}

output "eth_beacon_api_url" {
  description = "Ethereum beacon API URL"
  value       = "http://${google_compute_address.eth_beacon_ip.address}:5052"
}

output "chain_id" {
  description = "Ethereum chain ID"
  value       = var.CHAIN_ID
}

output "deployment_namespace" {
  description = "Kubernetes namespace where eth-devnet is deployed"
  value       = var.NAMESPACE
}

output "release_name" {
  description = "Helm release name"
  value       = var.RELEASE_PREFIX
}

