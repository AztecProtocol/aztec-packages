terraform {
  backend "gcs" {
    bucket = "aztec-terraform"
    prefix = "metrics-deploy/us-west1-a/aztec-gke-private/telemetry/terraform.tfstate"
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

provider "google" {
  project = var.project
  region  = var.region
}

provider "kubernetes" {
  alias          = "gke-cluster"
  config_path    = "~/.kube/config"
  config_context = var.cluster
}

provider "helm" {
  alias = "gke-cluster"
  kubernetes {
    config_path    = "~/.kube/config"
    config_context = var.cluster
  }
}

resource "google_compute_global_address" "otel_collector_ingress" {
  provider     = google
  name         = "${var.RELEASE_NAME}-otel-collector-ingress"
  address_type = "EXTERNAL"

  lifecycle {
    prevent_destroy = true
  }
}

resource "kubernetes_namespace" "ns" {
  provider = kubernetes.gke-cluster
  metadata {
    name = var.RELEASE_NAME
  }
}

resource "kubernetes_manifest" "otel_ingress_certificate" {
  provider = kubernetes.gke-cluster

  manifest = {
    "apiVersion" = "networking.gke.io/v1"
    "kind"       = "ManagedCertificate"
    "metadata" = {
      "name"      = "otel-ingress-cert"
      "namespace" = kubernetes_namespace.ns.metadata[0].name
    }
    "spec" = {
      "domains" = [
        var.HOSTNAME
      ]
    }
  }
}

resource "kubernetes_manifest" "otel_ingress_backend" {
  provider = kubernetes.gke-cluster

  manifest = {
    "apiVersion" = "cloud.google.com/v1"
    "kind"       = "BackendConfig"
    "metadata" = {
      "name"      = "otel-ingress-backend"
      "namespace" = kubernetes_namespace.ns.metadata[0].name
    }
    "spec" = {
      "healthCheck" = {
        "checkIntervalSec" = 15
        "timeoutSec"       = 5
        "type"             = "HTTP"
        "port"             = 13133
        "requestPath"      = "/"
      }
    }
  }
}

resource "helm_release" "otel_collector" {
  provider          = helm.gke-cluster
  name              = "otel"
  namespace         = kubernetes_namespace.ns.metadata[0].name
  repository        = "https://open-telemetry.github.io/opentelemetry-helm-charts"
  chart             = "opentelemetry-collector"
  version           = "0.127.2"
  create_namespace  = false
  upgrade_install   = true
  dependency_update = true
  force_update      = true
  reuse_values      = false
  reset_values      = true
  depends_on        = [kubernetes_manifest.otel_ingress_backend]

  # base values file
  values = [file("./values/public-otel-collector.yaml")]

  set {
    name  = "ingress.annotations.kubernetes\\.io\\/ingress\\.global-static-ip-name"
    value = google_compute_global_address.otel_collector_ingress.name
  }

  set {
    name  = "ingress.annotations.networking\\.gke\\.io\\/managed-certificates"
    value = "otel-ingress-cert"
  }

  set {
    name  = "ingress.hosts[0].host"
    value = var.HOSTNAME
  }

  timeout         = 300
  wait            = true
  wait_for_jobs   = true
  atomic          = true
  cleanup_on_fail = true
}

resource "helm_release" "public_prometheus" {
  provider          = helm.gke-cluster
  name              = "prometheus"
  namespace         = kubernetes_namespace.ns.metadata[0].name
  repository        = "https://prometheus-community.github.io/helm-charts"
  chart             = "prometheus"
  version           = "25.27.0"
  create_namespace  = false
  upgrade_install   = true
  dependency_update = true
  force_update      = true
  reuse_values      = false
  reset_values      = true

  values = [file("./values/public-prometheus.yaml")]

  timeout         = 300
  wait            = true
  wait_for_jobs   = true
  atomic          = true
  cleanup_on_fail = true
}
