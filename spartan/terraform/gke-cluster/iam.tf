# Create the service account
resource "google_service_account" "gke_sa" {
  account_id   = "aztec-gke-nodes-sa"
  display_name = "Aztec GKE Nodes Service Account"
  description  = "Service account for aztec GKE nodes"
}

# Add IAM roles to the service account
resource "google_project_iam_member" "gke_sa_roles" {
  for_each = toset([
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
    "roles/monitoring.viewer",
    "roles/artifactregistry.reader",
    "roles/cloudtrace.agent",
    "roles/storage.objectUser"
  ])
  project = var.project
  role    = each.key
  member  = "serviceAccount:${google_service_account.gke_sa.email}"
}

# Create a new service account for Helm
resource "google_service_account" "helm_sa" {
  account_id   = "helm-sa"
  display_name = "Helm Service Account"
  description  = "Service account for Helm operations"
}

# Add IAM roles to the Helm service account
resource "google_project_iam_member" "helm_sa_roles" {
  for_each = toset([
    "roles/container.admin",
    "roles/storage.admin",
    "roles/secretmanager.admin",
    "roles/compute.loadBalancerAdmin"
  ])
  project = var.project
  role    = each.key
  member  = "serviceAccount:${google_service_account.helm_sa.email}"
}

data "google_iam_policy" "all_users_storage_read" {
  binding {
    role = "roles/storage.objectViewer"
    members = [
      "allUsers",
    ]
  }
}

