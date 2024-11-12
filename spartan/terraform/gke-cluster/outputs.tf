# Output the cluster endpoint
output "cluster_endpoint" {
  value = google_container_cluster.primary.endpoint
}

# Output the service account email
output "service_account_email" {
  value = google_service_account.gke_sa.email
}
