locals {
  network_deployer_roles = toset([
    "roles/container.admin",
    "roles/storage.admin",
    "roles/secretmanager.admin",
    "roles/compute.loadBalancerAdmin",
    "roles/dns.admin"
  ])

  ci_observer_roles = toset([
    "roles/logging.viewer",
    "roles/monitoring.viewer"
  ])
}

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
  for_each = local.network_deployer_roles
  project  = var.project
  role     = each.key
  member   = "serviceAccount:${google_service_account.helm_sa.email}"
}

# Create a service account for CI
resource "google_service_account" "ci" {
  account_id   = var.ci_service_account_id
  display_name = "CI Service Account"
  description  = "Service account for CI jobs that publish internal artifacts and deploy networks"
}

resource "google_project_iam_member" "ci_network_deployer_roles" {
  for_each = local.network_deployer_roles
  project  = var.project
  role     = each.key
  member   = "serviceAccount:${google_service_account.ci.email}"
}

resource "google_project_iam_member" "ci_observer_roles" {
  for_each = local.ci_observer_roles
  project  = var.project
  role     = each.key
  member   = "serviceAccount:${google_service_account.ci.email}"
}

resource "google_project_iam_member" "ci_network_deploy_project_roles" {
  for_each = toset([
    "roles/container.developer",
    "roles/secretmanager.secretAccessor",
    "roles/compute.loadBalancerAdmin"
  ])
  project = var.project
  role    = each.key
  member  = "serviceAccount:${google_service_account.ci.email}"
}

resource "google_storage_bucket_iam_member" "ci_terraform_state_object_user" {
  bucket = "aztec-terraform"
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.ci.email}"
}

resource "google_dns_managed_zone_iam_member" "ci_rpc_dns_admin" {
  project      = var.project
  managed_zone = "rpc-aztec-labs-com"
  role         = "roles/dns.admin"
  member       = "serviceAccount:${google_service_account.ci.email}"
}

resource "google_project_iam_member" "ci_network_deploy_project_roles" {
  for_each = toset([
    "roles/container.developer",
    "roles/secretmanager.secretAccessor",
    "roles/compute.loadBalancerAdmin"
  ])
  project = var.project
  role    = each.key
  member  = "serviceAccount:${google_service_account.ci.email}"
}

resource "google_storage_bucket_iam_member" "ci_terraform_state_object_user" {
  bucket = "aztec-terraform"
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.ci.email}"
}

resource "google_dns_managed_zone_iam_member" "ci_rpc_dns_admin" {
  project      = var.project
  managed_zone = "rpc-aztec-labs-com"
  role         = "roles/dns.admin"
  member       = "serviceAccount:${google_service_account.ci.email}"
}

resource "google_service_account" "npm_registry_reader" {
  account_id   = var.npm_registry_reader_service_account_id
  display_name = "npm Registry Reader Service Account"
  description  = "Service account for CI jobs that install internal npm packages"
}

# Service account for External Secrets Operator
resource "google_service_account" "eso" {
  account_id   = "external-secrets-operator"
  display_name = "External Secrets Operator"
  description  = "Service account for ESO to access GCP Secret Manager"
}

# Give the SA read only access secrets in the project
# NOTE: this gives read access to all secrets
resource "google_project_iam_member" "eso_secret_accessor" {
  project = var.project
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.eso.email}"
}

# Allow both clusters to use the SA from the external-secrets namespace
resource "google_service_account_iam_member" "eso_workload_identity" {
  for_each           = toset(["aztec-gke-private", "aztec-gke-public"])
  service_account_id = google_service_account.eso.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project}.svc.id.goog[external-secrets/external-secrets]"
}

data "google_iam_policy" "all_users_storage_read" {
  binding {
    role = "roles/storage.objectViewer"
    members = [
      "allUsers",
    ]
  }
}
