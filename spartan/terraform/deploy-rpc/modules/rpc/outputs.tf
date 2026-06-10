output "release_name" {
  description = "Helm release name."
  value       = helm_release.rpc.name
}

output "workload_name" {
  description = "Kubernetes StatefulSet name."
  value       = local.workload_name
}

output "service_name" {
  description = "RPC Kubernetes Service name."
  value       = local.workload_name
}

output "service_port" {
  description = "RPC Kubernetes Service port."
  value       = 8080
}

output "namespace" {
  description = "Kubernetes namespace containing the RPC workload."
  value       = var.NAMESPACE
}

output "l1_secret_name" {
  description = "Kubernetes Secret name populated by ExternalSecrets for L1 env vars."
  value       = local.l1_secret_name
}

output "hpa_name" {
  description = "HorizontalPodAutoscaler name."
  value       = kubernetes_manifest.hpa.manifest.metadata.name
}
