terraform {
  backend "gcs" {
  }
  required_providers {
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.16.1"
    }
  }
}

provider "helm" {
  kubernetes {
    config_path    = "~/.kube/config"
    config_context = var.GKE_CLUSTER_CONTEXT
  }
}

resource "helm_release" "keda" {
  name             = var.RELEASE_NAME
  chart            = "${path.module}/keda-2.19.0.tgz"
  namespace        = var.KEDA_NAMESPACE
  create_namespace = true
  upgrade_install  = true

  values = [
    yamlencode({
      crds = {
        install = true
      }
      nodeSelector = {
        node-type = "infra"
      }
    })
  ]

  timeout = 300
  wait    = true
}
