output "rpc_services" {
  description = "RPC Service names and ports keyed by alias."
  value       = module.environment.rpc_services
}

output "kong_routes" {
  description = "Kong route names keyed by alias."
  value       = module.environment.kong_routes
}

output "kong_upstream_policy_name" {
  description = "Kong upstream policy name, or null when disabled."
  value       = module.environment.kong_upstream_policy_name
}

output "kong_metrics_service" {
  description = "Kong metrics Service details for Prometheus scraping."
  value       = module.environment.kong_metrics_service
}

output "frontend_load_balancer_ip" {
  description = "Global static IP assigned to the public GKE frontend Ingress."
  value       = module.environment.frontend_load_balancer_ip
}

output "gcp_managed_certificate_name" {
  description = "GKE ManagedCertificate resource name for RPC hosts."
  value       = module.environment.gcp_managed_certificate_name
}
