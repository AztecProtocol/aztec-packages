resource "google_compute_global_address" "grafana_ip" {
  name        = "grafana-global-ip"
  description = "Static IP for Grafana"

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_compute_managed_ssl_certificate" "grafana_cert" {
  name        = "grafana-cert"
  description = "Managed SSL certificate for Grafana ingress"

  managed {
    domains = [var.GRAFANA_HOST]
  }

  lifecycle {
    prevent_destroy = true
  }
}

output "grafana_ip_name" {
  value       = google_compute_global_address.grafana_ip.name
  description = "The static IP address name"
}

output "grafana_ip_address" {
  value       = google_compute_global_address.grafana_ip.address
  description = "The static IP address"
}

output "grafana_cert_name" {
  value       = google_compute_managed_ssl_certificate.grafana_cert.name
  description = "The name of the certificate issued for the host"
}

output "grafana_host" {
  value       = var.GRAFANA_HOST
  description = "Grafana host"
}
