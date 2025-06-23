output "service_account_email" {
  value = google_service_account.gke_sa.email
}

output "region" {
  description = "Google cloud region"
  value       = var.region
}
