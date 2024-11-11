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
  config_context = "arn:aws:eks:us-east-1:278380418400:cluster/spartan"
}

provider "kubernetes" {
  alias          = "gke-cluster"
  config_path    = "~/.kube/config"
  config_context = "gke_testnet-440309_us-east1_spartan-provers"
}

# Helm providers for each cluster
provider "helm" {
  alias = "eks-cluster"
  kubernetes {
    config_path    = "~/.kube/config"
    config_context = "arn:aws:eks:us-east-1:278380418400:cluster/spartan"
  }
}

provider "helm" {
  alias = "gke-cluster"
  kubernetes {
    config_path    = "~/.kube/config"
    config_context = "gke_testnet-440309_us-east1_spartan-provers"
  }
}

# Deploy to eks-cluster
resource "kubernetes_namespace" "example_eks-cluster" {
  provider = kubernetes.eks-cluster
  metadata {
    name = var.testnet_name
  }
}

# Deploy to gke-cluster
resource "kubernetes_namespace" "example_gke-cluster" {
  provider = kubernetes.gke-cluster
  metadata {
    name = var.testnet_name
  }
}

# Example Helm release for eks-cluster
resource "helm_release" "nginx_eks-cluster" {
  provider   = helm.eks-cluster
  name       = "nginx"
  repository = "https://charts.bitnami.com/bitnami"
  chart      = "nginx"
  namespace  = kubernetes_namespace.example_eks-cluster.metadata[0].name

  values = [
    <<-EOT
    service:
      type: ClusterIP
    replicaCount: 2
    EOT
  ]
}

# Example Helm release for gke-cluster
resource "helm_release" "nginx_gke-cluster" {
  provider   = helm.gke-cluster
  name       = "nginx"
  repository = "https://charts.bitnami.com/bitnami"
  chart      = "nginx"
  namespace  = kubernetes_namespace.example_gke-cluster.metadata[0].name

  # Different configuration for gke-cluster
  values = [
    <<-EOT
    service:
      type: ClusterIP
    replicaCount: 3
    resources:
      limits:
        cpu: 200m
        memory: 256Mi
      requests:
        cpu: 100m
        memory: 128Mi
    EOT
  ]
}

# Variables remain the same
variable "clusters" {
  type = map(string)
  default = {
    eks-cluster = "eks-cluster-context"
    gke-cluster = "gke-cluster-context"
  }
}
