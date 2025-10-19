output "reth_rpc_ip" {
  description = "Static IP address for Reth RPC load balancer"
  value       = google_compute_address.reth_rpc_ip.address
}

output "reth_rpc_endpoints" {
  description = "Reth RPC endpoints"
  value = {
    http = "http://${google_compute_address.reth_rpc_ip.address}:8545"
    ws   = "ws://${google_compute_address.reth_rpc_ip.address}:8546"
  }
}

output "lighthouse_rpc_ip" {
  description = "Static IP address for Lighthouse RPC load balancer"
  value       = google_compute_address.lighthouse_rpc_ip.address
}

output "lighthouse_rpc_endpoint" {
  description = "Lighthouse Beacon API endpoint"
  value       = "http://${google_compute_address.lighthouse_rpc_ip.address}:5052"
}

# Temporary public load balancer outputs
output "reth_rpc_public_ip" {
  description = "Static IP address for temporary public Reth RPC load balancer"
  value       = google_compute_address.reth_rpc_public_ip.address
}

output "reth_rpc_public_endpoints" {
  description = "Temporary public Reth RPC endpoints"
  value = {
    http = "http://${google_compute_address.reth_rpc_public_ip.address}:8545"
    ws   = "ws://${google_compute_address.reth_rpc_public_ip.address}:8546"
  }
}

output "lighthouse_rpc_public_ip" {
  description = "Static IP address for temporary public Lighthouse RPC load balancer"
  value       = google_compute_address.lighthouse_rpc_public_ip.address
}

output "lighthouse_rpc_public_endpoint" {
  description = "Temporary public Lighthouse Beacon API endpoint"
  value       = "http://${google_compute_address.lighthouse_rpc_public_ip.address}:5052"
}
