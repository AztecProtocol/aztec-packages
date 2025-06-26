terraform {
  backend "gcs" {
    # Be sure to pass the appropriate values to `terraform init
    # e.g. for staging:
    # bucket = "aztec-terraform"
    # prefix = "ingress-deploy/us-west1-a/aztec-gke-private/staging-rc-1/terraform.tfstate"
    # There are no defaults here because defaults could to fractured state
  }
  required_providers {
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

resource "google_compute_global_address" "ingress" {
  provider     = google
  name         = "${var.RELEASE_NAME}-ingress"
  address_type = "EXTERNAL"

  lifecycle {
    prevent_destroy = true
  }
}

resource "kubernetes_manifest" "ingress_certificate" {
  provider = kubernetes.gke-cluster

  manifest = {
    "apiVersion" = "networking.gke.io/v1"
    "kind"       = "ManagedCertificate"
    "metadata" = {
      "name"      = "${var.RELEASE_NAME}-ingress-certificate"
      "namespace" = var.NAMESPACE
    }
    "spec" = {
      "domains" = [
        var.HOSTNAME
      ]
    }
  }
}

resource "kubernetes_manifest" "ingress" {
  provider = kubernetes.gke-cluster
  manifest = {
    "apiVersion" = "networking.k8s.io/v1"
    "kind"       = "Ingress"
    "metadata" = {
      "name"      = "${var.RELEASE_NAME}-ingress"
      "namespace" = var.NAMESPACE
      "annotations" = {
        "kubernetes.io/ingress.class"                 = "gce"
        "kubernetes.io/ingress.global-static-ip-name" = "${var.RELEASE_NAME}-ingress"
        "networking.gke.io/managed-certificates"      = "${var.RELEASE_NAME}-ingress-certificate"
      }
    }
    "spec" = {
      "rules" = [
        {
          "host" = var.HOSTNAME
          "http" = {
            "paths" = [
              {
                "path"     = "/"
                "pathType" = "Prefix"
                "backend" = {
                  "service" = {
                    "name" = var.SERVICE
                    "port" = {
                      "number" = 8080
                    }
                  }
                }
              }
            ]
          }
        }
      ]
    }
  }
}

resource "kubernetes_manifest" "ingress_backend" {
  provider = kubernetes.gke-cluster
  manifest = {
    "apiVersion" = "cloud.google.com/v1"
    "kind"       = "BackendConfig"
    "metadata" = {
      "name"      = "${var.RELEASE_NAME}-ingress-backend"
      "namespace" = var.NAMESPACE
    }
    "spec" = {
      "healthCheck" = {
        "checkIntervalSec" = 15
        "timeoutSec"       = 5
        "type"             = "HTTP"
        "port"             = 8080
        "requestPath"      = "/status"
      }
    }
  }
}

resource "kubernetes_annotations" "service_backend" {
  provider    = kubernetes.gke-cluster
  api_version = "v1"
  kind        = "Service"
  metadata {
    name      = var.SERVICE
    namespace = var.NAMESPACE
  }
  annotations = {
    "cloud.google.com/backend-config" = jsonencode({
      default = "${var.RELEASE_NAME}-ingress-backend"
    })
  }
}
