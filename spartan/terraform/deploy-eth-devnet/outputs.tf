output "eth_execution_ip" {
  description = "IP address for Ethereum execution client (Static IP or Cluster IP)"
  value       = data.kubernetes_service.eth_execution.spec[0].cluster_ip
}

output "eth_beacon_ip" {
  description = "IP address for Ethereum beacon client (Static IP or Cluster IP)"
  value       = data.kubernetes_service.eth_beacon.spec[0].cluster_ip
}

output "eth_execution_rpc_url" {
  description = "Ethereum execution RPC URL"
  value       = "http://${data.kubernetes_service.eth_execution.spec[0].cluster_ip}:8545"
}

output "eth_execution_ws_url" {
  description = "Ethereum execution WebSocket URL"
  value       = "ws://${data.kubernetes_service.eth_execution.spec[0].cluster_ip}:8546"
}

output "eth_beacon_api_url" {
  description = "Ethereum beacon API URL"
  value       = "http://${data.kubernetes_service.eth_beacon.spec[0].cluster_ip}:5052"
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

