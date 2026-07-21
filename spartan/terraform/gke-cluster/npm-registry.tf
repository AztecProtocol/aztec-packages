resource "google_artifact_registry_repository" "npm_registry" {
  project       = var.project
  location      = var.region
  repository_id = var.npm_registry_repository_id
  description   = "npm repository"
  format        = "NPM"

  depends_on = [google_project_service.artifact_registry]
}

resource "google_artifact_registry_repository_iam_member" "ci_npm_registry_reader" {
  project    = google_artifact_registry_repository.npm_registry.project
  location   = google_artifact_registry_repository.npm_registry.location
  repository = google_artifact_registry_repository.npm_registry.name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.npm_registry_reader.email}"
}

resource "google_artifact_registry_repository_iam_member" "ci_npm_registry_publisher" {
  project    = google_artifact_registry_repository.npm_registry.project
  location   = google_artifact_registry_repository.npm_registry.location
  repository = google_artifact_registry_repository.npm_registry.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.ci.email}"
}
