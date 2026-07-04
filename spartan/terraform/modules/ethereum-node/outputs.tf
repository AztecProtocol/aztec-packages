output "namespace" {
  description = "Kubernetes namespace containing the Ethereum node pair."
  value       = var.NAMESPACE
}

output "reth_release_name" {
  description = "Reth Helm release name."
  value       = helm_release.reth.name
}

output "reth_service_name" {
  description = "Reth Kubernetes Service name."
  value       = local.reth_release_name
}

output "reth_http_port" {
  description = "Reth HTTP JSON-RPC service port."
  value       = 8545
}

output "reth_pvc_name" {
  description = "Terraform-managed Reth PVC name."
  value       = kubernetes_persistent_volume_claim_v1.reth_storage.metadata[0].name
}

output "reth_ws_port" {
  description = "Reth WebSocket service port."
  value       = 8546
}

output "reth_auth_port" {
  description = "Reth authenticated Engine API service port."
  value       = 8551
}

output "reth_http_url" {
  description = "Internal Reth HTTP JSON-RPC URL."
  value       = "http://${local.reth_release_name}.${var.NAMESPACE}.svc.cluster.local:8545"
}

output "reth_ws_url" {
  description = "Internal Reth WebSocket URL."
  value       = "ws://${local.reth_release_name}.${var.NAMESPACE}.svc.cluster.local:8546"
}

output "reth_internal_load_balancer_service_name" {
  description = "Reth internal LoadBalancer Service name, or null when disabled."
  value       = try(kubernetes_service_v1.reth_internal_load_balancer[0].metadata[0].name, null)
}

output "reth_internal_load_balancer_ip" {
  description = "Static internal VPC IP assigned to the Reth direct-access Service, or null when disabled."
  value       = var.RETH_INTERNAL_LOAD_BALANCER == null ? null : var.RETH_INTERNAL_LOAD_BALANCER.ip
}

output "reth_internal_http_url" {
  description = "VPC-internal Reth HTTP JSON-RPC URL, or null when disabled."
  value       = var.RETH_INTERNAL_LOAD_BALANCER == null ? null : "http://${var.RETH_INTERNAL_LOAD_BALANCER.ip}:8545"
}

output "reth_internal_ws_url" {
  description = "VPC-internal Reth WebSocket URL, or null when disabled."
  value       = var.RETH_INTERNAL_LOAD_BALANCER == null ? null : "ws://${var.RETH_INTERNAL_LOAD_BALANCER.ip}:8546"
}

output "lighthouse_release_name" {
  description = "Lighthouse Helm release name."
  value       = helm_release.lighthouse.name
}

output "lighthouse_service_name" {
  description = "Lighthouse Kubernetes Service name."
  value       = local.lighthouse_release_name
}

output "lighthouse_http_port" {
  description = "Lighthouse Beacon API service port."
  value       = 5052
}

output "lighthouse_pvc_name" {
  description = "Terraform-managed Lighthouse PVC name."
  value       = kubernetes_persistent_volume_claim_v1.lighthouse_storage.metadata[0].name
}

output "lighthouse_http_url" {
  description = "Internal Lighthouse Beacon API URL."
  value       = "http://${local.lighthouse_release_name}.${var.NAMESPACE}.svc.cluster.local:5052"
}

output "lighthouse_internal_load_balancer_service_name" {
  description = "Lighthouse internal LoadBalancer Service name, or null when disabled."
  value       = try(kubernetes_service_v1.lighthouse_internal_load_balancer[0].metadata[0].name, null)
}

output "lighthouse_internal_load_balancer_ip" {
  description = "Static internal VPC IP assigned to the Lighthouse direct-access Service, or null when disabled."
  value       = var.LIGHTHOUSE_INTERNAL_LOAD_BALANCER == null ? null : var.LIGHTHOUSE_INTERNAL_LOAD_BALANCER.ip
}

output "lighthouse_internal_http_url" {
  description = "VPC-internal Lighthouse Beacon API URL, or null when disabled."
  value       = var.LIGHTHOUSE_INTERNAL_LOAD_BALANCER == null ? null : "http://${var.LIGHTHOUSE_INTERNAL_LOAD_BALANCER.ip}:5052"
}
