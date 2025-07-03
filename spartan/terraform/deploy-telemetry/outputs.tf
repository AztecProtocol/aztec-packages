output "otel_ingress_hostname" {
  description = "Public otel ingress"
  value       = "https://${var.HOSTNAME}"
}

output "otel_ingress_ip" {
  description = "Public otel ingress IP address"
  value       = google_compute_global_address.otel_collector_ingress.address
}
