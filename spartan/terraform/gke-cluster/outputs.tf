output "service_account_email" {
  value = google_service_account.gke_sa.email
}

output "region" {
  description = "Google cloud region"
  value       = var.region
}

output "staging_public_rpc_ip" {
  value       = google_compute_global_address.staging_public_rpc_ip.address
  description = "The static IP address for staging-public RPC ingress"
}

output "staging_public_rpc_cert_name" {
  value       = google_compute_managed_ssl_certificate.staging_public_rpc_cert.name
  description = "The name of the managed SSL certificate for staging-public RPC"
}
