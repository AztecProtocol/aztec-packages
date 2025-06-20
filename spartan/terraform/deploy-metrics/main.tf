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

resource "google_compute_address" "grafana_ip" {
  provider     = google
  name         = "grafana-ip-${var.RELEASE_NAME}"
  address_type = "EXTERNAL"
  region       = var.region

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_compute_address" "otel_collector_ip" {
  provider     = google
  name         = "otel-ip-${var.RELEASE_NAME}"
  address_type = "EXTERNAL"
  region       = var.region

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_compute_address" "public_otel_collector_ip" {
  provider     = google
  name         = "public-otel-ip-${var.RELEASE_NAME}"
  address_type = "EXTERNAL"
  region       = var.region

  lifecycle {
    prevent_destroy = true
  }
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

data "google_secret_manager_secret_version" "grafana_password" {
  secret = var.GRAFANA_PASSWORD_SECRET_NAME
}

data "google_secret_manager_secret_version" "slack_webhook" {
  secret = var.SLACK_WEBHOOK_SECRET_NAME
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
    value = google_compute_address.grafana_ip.address
  }

  set {
    name  = "grafana.grafana\\.ini.server.domain"
    value = "http://${google_compute_address.grafana_ip.address}"
  }

  set {
    name  = "grafana.adminPassword"
    value = data.google_secret_manager_secret_version.grafana_password.secret_data
  }

  set {
    name  = "grafana.env.SLACK_WEBHOOK_URL"
    value = data.google_secret_manager_secret_version.slack_webhook.secret_data
  }

  set {
    name  = "opentelemetry-collector.service.loadBalancerIP"
    value = google_compute_address.otel_collector_ip.address
  }

  set {
    name  = "prometheus.serverFiles.prometheus\\.yml.scrape_configs[0].job_name"
    value = "prometheus"
  }

  set {
    name  = "prometheus.serverFiles.prometheus\\.yml.scrape_configs[0].static_configs[0].targets[0]"
    value = "127.0.0.1:9090"
  }

  set {
    name  = "prometheus.serverFiles.prometheus\\.yml.scrape_configs[1].job_name"
    value = "otel-collector"
  }

  set {
    name  = "prometheus.serverFiles.prometheus\\.yml.scrape_configs[1].static_configs[0].targets[0]"
    value = "${google_compute_address.otel_collector_ip.address}:8888"
  }

  set {
    name  = "prometheus.serverFiles.prometheus\\.yml.scrape_configs[2].job_name"
    value = "aztec"
  }

  set {
    name  = "prometheus.serverFiles.prometheus\\.yml.scrape_configs[2].static_configs[0].targets[0]"
    value = "${google_compute_address.otel_collector_ip.address}:8889"
  }

  # use k8s service discovery to scrape all the public otel collectors
  set {
    name  = "prometheus.serverFiles.prometheus\\.yml.scrape_configs[3].job_name"
    value = "public-otelcol"
  }

  set {
    name  = "prometheus.serverFiles.prometheus\\.yml.scrape_configs[3].kubernetes_sd_config[0].role"
    value = "pod"
  }

  set {
    name  = "prometheus.serverFiles.prometheus\\.yml.scrape_configs[3].kubernetes_sd_config[0].namespaces.own_namespace"
    value = false
  }

  set_list {
    name  = "prometheus.serverFiles.prometheus\\.yml.scrape_configs[3].kubernetes_sd_config[0].namespaces.names"
    value = ["${var.RELEASE_NAME}-public"]
  }

  # Setting timeout and wait conditions
  timeout       = 600 # 10 minutes in seconds
  wait          = true
  wait_for_jobs = true

}

locals {
  public_otel_ingress_host = "public-otel.alpha-testnet.aztec.network"
}

resource "kubernetes_manifest" "public_otel_ingress_certificate" {
  provider = kubernetes.gke-cluster
  manifest = {
    "apiVersion" = "networking.gke.io/v1"
    "kind"       = "ManagedCertificate"
    "metadata" = {
      "name"      = "${var.RELEASE_NAME}-public-otelcol-ingres-cert"
      "namespace" = "${var.RELEASE_NAME}-public"
    }
    "spec" = {
      "domains" = [
        local.public_otel_ingress_host
      ]
    }
  }
}

resource "helm_release" "public_otel_collector" {
  provider          = helm.gke-cluster
  name              = "${var.RELEASE_NAME}-public-otelcol"
  namespace         = "${var.RELEASE_NAME}-public"
  repository        = "https://open-telemetry.github.io/opentelemetry-helm-charts"
  chart             = "opentelemetry-collector"
  version           = "0.104.0"
  create_namespace  = true
  upgrade_install   = true
  dependency_update = true
  force_update      = true
  reuse_values      = true

  # base values file
  values = [file("./values/public-otel-collector.yaml")]

  set {
    # name  = "service.loadBalancerIP"
    name  = "ingress.annotations.kubernetes\\.io/ingress\\.global-static-ip-name\""
    value = google_compute_address.public_otel_collector_ip.address
  }

  set {
    name  = "ingress.annotations.networking\\.gke\\.io/managed-certificates"
    value = "${var.RELEASE_NAME}-public-otelcol-ingres-cert"
  }

  set {
    name  = "ingress.hosts[0].host"
    value = local.public_otel_ingress_host
  }

  timeout       = 600
  wait          = true
  wait_for_jobs = true
}
