terraform {
  backend "local" {}
  required_providers {
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.16.1"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.24.0"
    }
    google = {
      source  = "hashicorp/google"
      version = ">= 4.0"
    }
  }
}

provider "google" {
  project = var.project
}

provider "kubernetes" {
  alias          = "gke-cluster"
  config_path    = "~/.kube/config"
  config_context = var.K8S_CLUSTER_CONTEXT
}

provider "helm" {
  alias = "gke-cluster"
  kubernetes {
    config_path    = "~/.kube/config"
    config_context = var.K8S_CLUSTER_CONTEXT
  }
}

data "google_secret_manager_secret_version" "jwt" {
  project = var.project
  secret  = var.jwt_secret_name
  version = var.jwt_secret_version
}

resource "helm_release" "eth_mainnet" {
  provider         = helm.gke-cluster
  name             = var.RELEASE_PREFIX
  repository       = "../../"
  chart            = "eth-mainnet"
  namespace        = var.NAMESPACE
  create_namespace = true
  upgrade_install  = true

  set {
    name  = "ethereum.beacon.checkpointSyncUrl"
    value = var.L1_CHECKPOINT_SYNC_URL
  }

  set {
    name  = "fullnameOverride"
    value = var.RELEASE_PREFIX
  }

  set_sensitive {
    name  = "ethereum.jwt.secret"
    value = data.google_secret_manager_secret_version.jwt.secret_data
  }

  timeout       = 300
  wait          = true
  wait_for_jobs = false
}

data "kubernetes_service" "mainnet_eth_execution" {
  provider = kubernetes.gke-cluster
  metadata {
    name      = "${var.RELEASE_PREFIX}-eth-execution"
    namespace = var.NAMESPACE
  }
  depends_on = [helm_release.eth_mainnet]
}


