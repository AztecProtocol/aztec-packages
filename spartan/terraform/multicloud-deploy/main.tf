terraform {
  backend "s3" {
    bucket = "aztec-terraform"
    key    = "multicloud-deploy/terraform.tfstate"
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

# Define providers for different contexts
provider "kubernetes" {
  alias          = "eks-cluster"
  config_path    = "~/.kube/config"
  config_context = var.eks_cluster_context
}

provider "kubernetes" {
  alias          = "gke-cluster"
  config_path    = "~/.kube/config"
  config_context = var.gke_cluster_context
}

# Helm providers for each cluster
provider "helm" {
  alias = "eks-cluster"
  kubernetes {
    config_path    = "~/.kube/config"
    config_context = var.eks_cluster_context
  }
}

provider "helm" {
  alias = "gke-cluster"
  kubernetes {
    config_path    = "~/.kube/config"
    config_context = var.gke_cluster_context
  }
}

# Aztec Helm release for eks-cluster
resource "helm_release" "aztec-eks-cluster" {
  provider         = helm.eks-cluster
  name             = var.testnet_name
  repository       = "../../"
  chart            = "aztec-network"
  namespace        = var.testnet_name
  create_namespace = true
  values           = [file("../../aztec-network/values/${var.eks-values-file}")]

  # Setting timeout and wait conditions
  timeout       = 1800 # 30 minutes in seconds
  wait          = true
  wait_for_jobs = true
}

# Aztec Helm release for gke-cluster
resource "helm_release" "aztec-gke-cluster" {
  provider         = helm.gke-cluster
  name             = var.testnet_name
  repository       = "../../"
  chart            = "aztec-network"
  namespace        = var.testnet_name
  create_namespace = true
  values           = [file("../../aztec-network/values/${var.gke-values-file}")]

  # Setting timeout and wait conditions
  timeout       = 1800 # 30 minutes in seconds
  wait          = true
  wait_for_jobs = true
}
