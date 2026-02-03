output "cluster_endpoint" {
  value = google_container_cluster.primary.endpoint
}

output "kubernetes_cluster_name" {
  description = "GKE Cluster Name"
  value       = google_container_cluster.primary.name
}
