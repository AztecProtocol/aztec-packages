output "route_names" {
  description = "Kong-managed Ingress names keyed by RPC route."
  value       = { for name, route in kubernetes_manifest.rpc_route : name => route.manifest.metadata.name }
}

output "consumer_names" {
  description = "KongConsumer resource names keyed by configured consumer."
  value       = { for name, consumer in kubernetes_manifest.consumer : name => consumer.manifest.metadata.name }
}

output "anonymous_consumer_names" {
  description = "Anonymous KongConsumer resource names keyed by route."
  value       = { for name, consumer in kubernetes_manifest.anonymous_consumer : name => consumer.manifest.metadata.name }
}

output "consumer_credential_secret_names" {
  description = "Kubernetes Secret names referenced by KongConsumer credentials."
  value       = local.consumer_credential_secret_names
}

output "key_auth_plugin_names" {
  description = "KongPlugin names for key authentication, keyed by route."
  value       = { for name, plugin in kubernetes_manifest.key_auth_plugin : name => plugin.manifest.metadata.name }
}

output "prometheus_plugin_names" {
  description = "KongPlugin names for per-consumer Prometheus metrics, keyed by route."
  value       = { for name, plugin in kubernetes_manifest.prometheus_plugin : name => plugin.manifest.metadata.name }
}

output "kong_namespace" {
  description = "Namespace containing the Kong Helm release."
  value       = local.kong_namespace
}

output "upstream_policy_name" {
  description = "KongUpstreamPolicy name for RPC upstream balancing, or null when disabled."
  value       = local.upstream_policy_name
}

output "metrics_service_name" {
  description = "Kong metrics Service name, or null when disabled."
  value       = local.metrics_service_enabled ? kubernetes_service_v1.metrics[0].metadata[0].name : null
}

output "metrics_service_namespace" {
  description = "Kong metrics Service namespace, or null when disabled."
  value       = local.metrics_service_enabled ? kubernetes_service_v1.metrics[0].metadata[0].namespace : null
}

output "metrics_service_port" {
  description = "Kong metrics Service port, or null when disabled."
  value       = local.metrics_service_enabled ? var.KONG_METRICS_SERVICE_PORT : null
}

output "metrics_service_load_balancer_ingress" {
  description = "Kong metrics Service load balancer ingress status, or an empty list when disabled/not assigned yet."
  value       = local.metrics_service_enabled ? try(kubernetes_service_v1.metrics[0].status[0].load_balancer[0].ingress, []) : []
}

output "otel_collector_deployment_name" {
  description = "Local OTel collector Deployment name for Kong metrics, or null when disabled."
  value       = var.KONG_OTEL_METRICS_GCP_SECRET_NAME != "" ? local.otel_collector_name : null
}

output "frontend_load_balancer_ip" {
  description = "Global static IP assigned to the public GKE frontend Ingress."
  value       = local.frontend_load_balancer_ip
}

output "gcp_managed_certificate_name" {
  description = "GKE ManagedCertificate resource name for RPC hosts."
  value       = var.GCP_MANAGED_CERTIFICATE_ENABLED ? local.managed_certificate_name : null
}
