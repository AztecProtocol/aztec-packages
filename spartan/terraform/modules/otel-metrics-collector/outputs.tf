output "deployment_name" {
  description = "OpenTelemetry Collector Deployment name."
  value       = var.RELEASE_NAME
}

output "alloy_deployment_name" {
  description = "Grafana Alloy Deployment name, or null when IRM fan-out is disabled."
  value       = local.irm_enabled ? local.irm_alloy_name : null
}

output "alloy_otlp_http_endpoint" {
  description = "Cluster-local Alloy OTLP/HTTP endpoint, or null when IRM fan-out is disabled."
  value       = local.irm_enabled ? local.irm_otlp_endpoint : null
}
