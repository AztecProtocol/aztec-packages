output "otel_ingress_hostname" {
  description = "Public otel ingress"
  value       = "https://${var.HOSTS[0]}"
}

output "otel_ingress_ip" {
  description = "Public otel ingress IP address"
  value       = google_compute_global_address.otel_collector_ingress.address
}

output "prometheus_internal_ip" {
  description = "Private Prometheus internal load balancer IP address"
  value       = google_compute_address.prometheus_internal_lb.address
}

output "prometheus_internal_url" {
  description = "Private Prometheus URL reachable from clusters on the same VPC"
  value       = "http://${google_compute_address.prometheus_internal_lb.address}:80"
}
