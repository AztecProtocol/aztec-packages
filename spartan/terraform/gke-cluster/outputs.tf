output "cluster_endpoint" {
  value = google_container_cluster.primary.endpoint
}

output "service_account_email" {
  value = google_service_account.gke_sa.email
}

output "region" {
  description = "Google cloud region"
  value       = var.region
}

output "kubernetes_cluster_name" {
  description = "GKE Cluster Name"
  value       = google_container_cluster.primary.name
}
