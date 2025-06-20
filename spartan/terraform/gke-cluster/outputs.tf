output "service_account_email" {
  value = google_service_account.gke_sa.email
}

output "region" {
  description = "Google cloud region"
  value       = var.region
}

output "sepolia_node_rpc_api_url" {
  description = "A URL to access the JSON-RPC API of an L1 node"
  value       = google_blockchain_node_engine_blockchain_nodes.eth_sepolia_3.connection_info.0.endpoint_info.0.json_rpc_api_endpoint
}

output "sepolia_node_beacon_api_url" {
  description = "A URL to access the consensus API of an L1 node"
  value       = google_blockchain_node_engine_blockchain_nodes.eth_sepolia_3.ethereum_details.0.additional_endpoints.0.beacon_api_endpoint
}
