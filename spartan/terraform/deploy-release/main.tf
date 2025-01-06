terraform {
  backend "s3" {
    bucket = "aztec-terraform"
    region = "eu-west-2"
  }
  required_providers {
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.12.1"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.24.0"
    }
  }
}

provider "kubernetes" {
  alias          = "gke-cluster"
  config_path    = "~/.kube/config"
  config_context = var.gke_cluster_context
}

provider "helm" {
  alias = "gke-cluster"
  kubernetes {
    config_path    = "~/.kube/config"
    config_context = var.gke_cluster_context
  }
}

# Aztec Helm release for gke-cluster
resource "helm_release" "aztec-gke-cluster" {
  provider         = helm.gke-cluster
  name             = var.release_name
  repository       = "../../"
  chart            = "aztec-network"
  namespace        = var.release_name
  create_namespace = true

  # base values file
  values = [file("../../aztec-network/values/${var.values_file}")]

  set {
    name  = "images.aztec.image"
    value = var.aztec_docker_image
  }

  # Setting timeout and wait conditions
  timeout       = 1200 # 20 minutes in seconds
  wait          = true
  wait_for_jobs = true

}
