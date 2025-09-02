
output "grafana_ip" {
  description = "Grafana Static IP"
  value       = google_compute_address.grafana_ip.address
}

output "otel_collector_ip" {
  description = "OTEL Collector IP"
  value       = google_compute_address.otel_collector_ip.address
}

output "otel_collector_base_url" {
  description = "OTEL Collector IP"
  value       = "http://${google_compute_address.otel_collector_ip.address}:4318"
}

