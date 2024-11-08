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
  alias          = "cluster1"
  config_path    = "~/.kube/config"
  config_context = "arn:aws:eks:us-east-1:278380418400:cluster/spartan"
}

provider "kubernetes" {
  alias          = "cluster2"
  config_path    = "~/.kube/config"
  config_context = "gke_testnet-440309_us-east1_spartan-provers"
}

# Helm providers for each cluster
provider "helm" {
  alias = "cluster1"
  kubernetes {
    config_path    = "~/.kube/config"
    config_context = "arn:aws:eks:us-east-1:278380418400:cluster/spartan"
  }
}

provider "helm" {
  alias = "cluster2"
  kubernetes {
    config_path    = "~/.kube/config"
    config_context = "gke_testnet-440309_us-east1_spartan-provers"
  }
}

# Deploy to cluster1
resource "kubernetes_namespace" "example_cluster1" {
  provider = kubernetes.cluster1
  metadata {
    name = "my-namespace-cluster1"
  }
}

# Deploy to cluster2
resource "kubernetes_namespace" "example_cluster2" {
  provider = kubernetes.cluster2
  metadata {
    name = "my-namespace-cluster2"
  }
}

# Example Helm release for cluster1
resource "helm_release" "nginx_cluster1" {
  provider   = helm.cluster1
  name       = "nginx"
  repository = "https://charts.bitnami.com/bitnami"
  chart      = "nginx"
  namespace  = kubernetes_namespace.example_cluster1.metadata[0].name

  values = [
    <<-EOT
    service:
      type: ClusterIP
    replicaCount: 2
    EOT
  ]
}

# Example Helm release for cluster2
resource "helm_release" "nginx_cluster2" {
  provider   = helm.cluster2
  name       = "nginx"
  repository = "https://charts.bitnami.com/bitnami"
  chart      = "nginx"
  namespace  = kubernetes_namespace.example_cluster2.metadata[0].name

  # Different configuration for cluster2
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
    cluster1 = "cluster1-context"
    cluster2 = "cluster2-context"
  }
}

# Data source remains the same
data "kubernetes_service" "example" {
  provider = kubernetes.cluster1
  metadata {
    name      = "existing-service"
    namespace = "default"
  }
}
