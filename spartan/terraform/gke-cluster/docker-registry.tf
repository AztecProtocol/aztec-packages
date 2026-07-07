resource "google_project_service" "artifact_registry" {
  project = var.project
  service = "artifactregistry.googleapis.com"

  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "docker_registry" {
  project       = var.project
  location      = var.region
  repository_id = var.docker_registry_repository_id
  description   = "Docker repository for Spartan GKE images"
  format        = "DOCKER"

  depends_on = [google_project_service.artifact_registry]
}

resource "google_artifact_registry_repository_iam_member" "gke_sa_docker_registry_reader" {
  project    = google_artifact_registry_repository.docker_registry.project
  location   = google_artifact_registry_repository.docker_registry.location
  repository = google_artifact_registry_repository.docker_registry.name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.gke_sa.email}"
}

resource "google_artifact_registry_repository_iam_member" "ci_docker_registry_writer" {
  project    = google_artifact_registry_repository.docker_registry.project
  location   = google_artifact_registry_repository.docker_registry.location
  repository = google_artifact_registry_repository.docker_registry.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.ci.email}"
}

# Docker repository for images built by aztec-labs-eng/treasury-infra (e.g. propose-watcher)
resource "google_artifact_registry_repository" "treasury_infra" {
  project       = var.project
  location      = var.region
  repository_id = "treasury-infra"
  description   = "Images built by aztec-labs-eng/treasury-infra CI"
  format        = "DOCKER"

  depends_on = [google_project_service.artifact_registry]
}

resource "google_artifact_registry_repository_iam_member" "treasury_infra_ci_writer" {
  project    = google_artifact_registry_repository.treasury_infra.project
  location   = google_artifact_registry_repository.treasury_infra.location
  repository = google_artifact_registry_repository.treasury_infra.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.treasury_infra_ci.email}"
}
