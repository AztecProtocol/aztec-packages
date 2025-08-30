output "eth_execution_ip" {
  description = "IP address for Ethereum execution client (Static IP or Cluster IP)"
  value       = var.CREATE_STATIC_IPS ? google_compute_address.eth_execution_ip[0].address : data.kubernetes_service.eth_execution[0].spec[0].cluster_ip
}

output "eth_beacon_ip" {
  description = "IP address for Ethereum beacon client (Static IP or Cluster IP)"
  value       = var.CREATE_STATIC_IPS ? google_compute_address.eth_beacon_ip[0].address : data.kubernetes_service.eth_beacon[0].spec[0].cluster_ip
}

output "eth_execution_rpc_url" {
  description = "Ethereum execution RPC URL"
  value       = var.CREATE_STATIC_IPS ? "http://${google_compute_address.eth_execution_ip[0].address}:8545" : "http://${data.kubernetes_service.eth_execution[0].spec[0].cluster_ip}:8545"
}

output "eth_execution_ws_url" {
  description = "Ethereum execution WebSocket URL"
  value       = var.CREATE_STATIC_IPS ? "ws://${google_compute_address.eth_execution_ip[0].address}:8546" : "ws://${data.kubernetes_service.eth_execution[0].spec[0].cluster_ip}:8546"
}

output "eth_beacon_api_url" {
  description = "Ethereum beacon API URL"
  value       = var.CREATE_STATIC_IPS ? "http://${google_compute_address.eth_beacon_ip[0].address}:5052" : "http://${data.kubernetes_service.eth_beacon[0].spec[0].cluster_ip}:5052"
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

