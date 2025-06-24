
output "grafana_ip" {
  description = "Grafana Static IP"
  value       = google_compute_address.grafana_ip.address
}

output "otel_collector_ip" {
  description = "OTEL Collector IP"
  value       = google_compute_address.otel_collector_ip.address
}

output "public_otel_ingress" {
  description = "Public otel ingress"
  value       = "https://${local.public_otel_ingress_host}:4318"
}
