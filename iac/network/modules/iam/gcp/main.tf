resource "google_service_account" "vm_sa" {
  account_id   = var.account_id
  display_name = "Service Account"
}

resource "google_project_iam_member" "logging_role" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.vm_sa.email}"
}

resource "google_project_iam_member" "monitoring_role" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.vm_sa.email}"
}
