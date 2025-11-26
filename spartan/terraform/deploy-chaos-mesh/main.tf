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

resource "helm_release" "chaos_mesh" {
  provider          = helm.gke-cluster
  name              = var.RELEASE_NAME
  namespace         = var.CHAOS_MESH_NAMESPACE
  create_namespace  = true
  repository        = "https://charts.chaos-mesh.org"
  chart             = "chaos-mesh"
  version           = "2.8.0"
  dependency_update = true
  upgrade_install   = true
  force_update      = true
  recreate_pods     = true
  reuse_values      = true
  wait              = true
  wait_for_jobs     = true
  timeout           = 600

  values = [
    yamlencode({
      dashboard = {
        persistentVolume = {
          enabled          = true
          size             = "8Gi"
          storageClassName = "standard"
          mountPath        = "/data"
          subPath          = ""
        }

        securityMode = var.ENABLE_SAFE_MODE
      }

      chaosDaemon = {
        privileged = true
        runtime    = "containerd"
        socketPath = "/run/containerd/containerd.sock"
      }
    })
  ]
}


