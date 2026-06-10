output "rpc_services" {
  description = "RPC Service names and ports keyed by alias."
  value = {
    for name, rpc in module.rpc : name => {
      namespace = rpc.namespace
      service   = rpc.service_name
      port      = rpc.service_port
      hpa       = rpc.hpa_name
    }
  }
}

output "kong_routes" {
  description = "Kong route names keyed by alias."
  value       = module.rpc_gateway.route_names
}

output "kong_sticky_session_policy_name" {
  description = "Kong sticky session policy name."
  value       = module.rpc_gateway.sticky_session_policy_name
}

output "kong_metrics_service" {
  description = "Kong metrics Service details for Prometheus scraping."
  value = {
    namespace      = module.rpc_gateway.metrics_service_namespace
    service        = module.rpc_gateway.metrics_service_name
    port           = module.rpc_gateway.metrics_service_port
    ingress        = module.rpc_gateway.metrics_service_load_balancer_ingress
    otel_collector = module.rpc_gateway.otel_collector_deployment_name
  }
}

output "frontend_load_balancer_ip" {
  description = "Global static IP assigned to the public GKE frontend Ingress."
  value       = module.rpc_gateway.frontend_load_balancer_ip
}

output "gcp_managed_certificate_name" {
  description = "GKE ManagedCertificate resource name for RPC hosts."
  value       = module.rpc_gateway.gcp_managed_certificate_name
}
