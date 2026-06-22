output "service_account_email" {
  value = google_service_account.gke_sa.email
}

output "eso_service_account_email" {
  value = google_service_account.eso.email
}

output "ci_service_account_email" {
  value = google_service_account.ci.email
}

output "npm_registry_reader_service_account_email" {
  value = google_service_account.npm_registry_reader.email
}

output "region" {
  description = "Google cloud region"
  value       = var.region
}

output "docker_registry_hostname" {
  description = "Artifact Registry Docker hostname"
  value       = "${var.region}-docker.pkg.dev"
}

output "docker_registry_repository" {
  description = "Artifact Registry Docker repository resource name"
  value       = google_artifact_registry_repository.docker_registry.name
}

output "docker_registry_repository_url" {
  description = "Artifact Registry Docker repository URL prefix for image names"
  value       = "${var.region}-docker.pkg.dev/${var.project}/${google_artifact_registry_repository.docker_registry.repository_id}"
}

output "npm_registry_hostname" {
  description = "Artifact Registry npm hostname"
  value       = "${var.region}-npm.pkg.dev"
}

output "npm_registry_repository" {
  description = "Artifact Registry npm repository resource name"
  value       = google_artifact_registry_repository.npm_registry.name
}

output "npm_registry_repository_url" {
  description = "Artifact Registry npm repository URL for npm config"
  value       = "https://${var.region}-npm.pkg.dev/${var.project}/${google_artifact_registry_repository.npm_registry.repository_id}/"
}

output "devnet_network_rpc_ips" {
  description = "Static IPs and hostnames for v4 devnet networks"
  value = {
    for name, addr in google_compute_global_address.devnet_network_rpc_ip :
    name => {
      ip       = addr.address
      hostname = "${name}.aztec-labs.com"
    }
  }
}
