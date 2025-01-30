terraform {
  backend "gcs" {
    bucket = "aztec-terraform"
    prefix = "terraform/state"
  }
  required_providers {
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.16.1"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.24.0"
    }
  }
}

# Configure the Google Cloud provider
provider "google" {
  project = var.project
  region  = var.region
}

resource "google_compute_global_address" "grafana_ip" {
  provider     = google
  name         = "grafana-ip"
  address_type = "EXTERNAL"
}

resource "google_compute_global_address" "otel_collector_ip" {
  provider     = google
  name         = "otel-ip"
  address_type = "EXTERNAL"
}

provider "kubernetes" {
  alias          = "gke-cluster"
  config_path    = "~/.kube/config"
  config_context = var.GKE_CLUSTER_CONTEXT
}

provider "helm" {
  alias = "gke-cluster"
  kubernetes {
    config_path    = "~/.kube/config"
    config_context = var.GKE_CLUSTER_CONTEXT
  }
}

# Aztec Helm release for gke-cluster
resource "helm_release" "aztec-gke-cluster" {
  provider          = helm.gke-cluster
  name              = var.RELEASE_NAME
  repository        = "../../"
  chart             = "metrics"
  namespace         = var.RELEASE_NAME
  create_namespace  = true
  upgrade_install   = true
  dependency_update = true
  force_update      = true
  reuse_values      = true

  # base values file
  values = [file("../../metrics/values/${var.VALUES_FILE}")]

  set {
    name  = "grafana.service.loadBalancerIP"
    value = google_compute_global_address.grafana_ip.address
  }

  set {
    name  = "grafana.adminPassword"
    value = var.GRAFANA_DASHBOARD_PASSWORD
  }

  set {
    name  = "opentelemetry-collector.service.loadBalancerIP"
    value = google_compute_global_address.otel_collector_ip.address
  }


  # Setting timeout and wait conditions
  timeout       = 1200 # 20 minutes in seconds
  wait          = true
  wait_for_jobs = true

}
