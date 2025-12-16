terraform {
  backend "local" {}
  required_providers {
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.16.1"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.38.0"
    }
  }
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

# Install Chaos Mesh via the local helm chart wrapper in spartan/chaos-mesh
resource "helm_release" "chaos_mesh" {
  provider          = helm.gke-cluster
  name              = var.RELEASE_NAME
  namespace         = var.CHAOS_MESH_NAMESPACE
  create_namespace  = true
  repository        = "../../"
  chart             = "chaos-mesh"
  dependency_update = true
  upgrade_install   = true
  force_update      = true
  recreate_pods     = true
  reuse_values      = true
  wait              = true
  wait_for_jobs     = true
  timeout           = 600
}


