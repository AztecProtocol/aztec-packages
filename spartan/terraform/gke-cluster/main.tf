terraform {
  backend "s3" {
    bucket = "aztec-terraform"
    key    = "aztec-gke-cluster/terraform.tfstate"
    region = "eu-west-2"
  }
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

# Configure the Google Cloud provider
provider "google" {
  project = var.project
  region  = var.region
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
    "roles/artifactregistry.reader"
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
    "roles/secretmanager.admin"
  ])
  project = var.project
  role    = each.key
  member  = "serviceAccount:${google_service_account.helm_sa.email}"
}

# Create a GKE cluster
resource "google_container_cluster" "primary" {
  name     = var.cluster_name
  location = var.zone

  initial_node_count = 1
  # Remove default node pool after cluster creation
  remove_default_node_pool = true

  # Kubernetes version
  min_master_version = "latest"

  # Network configuration
  network    = "default"
  subnetwork = "default"

  # Master auth configuration
  master_auth {
    client_certificate_config {
      issue_client_certificate = false
    }
  }
}

# Create primary node pool with autoscaling
resource "google_container_node_pool" "primary_nodes" {
  name     = "primary-node-pool"
  location = var.zone
  cluster  = google_container_cluster.primary.name

  # Enable autoscaling
  autoscaling {
    min_node_count = 1
    max_node_count = 2
  }

  # Node configuration
  node_config {
    machine_type = "t2d-standard-32"

    service_account = google_service_account.gke_sa.email
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    labels = {
      env = "production"
    }
    tags = ["aztec-gke-node"]
  }

  # Management configuration
  management {
    auto_repair  = true
    auto_upgrade = true
  }
}

# Create node pool for aztec nodes (validators, prover nodes, boot nodes)
resource "google_container_node_pool" "aztec_nodes" {
  name     = "aztec-node-pool"
  location = var.zone
  cluster  = google_container_cluster.primary.name

  # Enable autoscaling
  autoscaling {
    min_node_count = 1
    max_node_count = 128
  }

  # Node configuration
  node_config {
    machine_type = "t2d-standard-4"

    service_account = google_service_account.gke_sa.email
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    labels = {
      env = "production"
    }
    tags = ["aztec-gke-node", "aztec"]
  }

  # Management configuration
  management {
    auto_repair  = true
    auto_upgrade = true
  }
}

# Create spot instance node pool with autoscaling
resource "google_container_node_pool" "spot_nodes" {
  name     = "aztec-spot-node-pool"
  location = var.zone
  cluster  = google_container_cluster.primary.name

  # Enable autoscaling
  autoscaling {
    min_node_count = 0
    max_node_count = 10
  }

  # Node configuration
  node_config {
    machine_type = "t2d-standard-32"
    spot         = true

    service_account = google_service_account.gke_sa.email
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    labels = {
      env  = "production"
      pool = "spot"
    }
    tags = ["aztec-gke-node", "spot"]

    # Spot instance termination handler
    taint {
      key    = "cloud.google.com/gke-spot"
      value  = "true"
      effect = "NO_SCHEDULE"
    }
  }

  # Management configuration
  management {
    auto_repair  = true
    auto_upgrade = true
  }
}
