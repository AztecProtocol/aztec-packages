terraform {
  backend "gcs" {}

  required_providers {
    helm = {
      source  = "hashicorp/helm"
      version = "~> 3.1.2"
    }
  }
}

provider "helm" {
  kubernetes = {
    config_path    = "~/.kube/config"
    config_context = var.GKE_CLUSTER_CONTEXT
  }
}

resource "helm_release" "kong_crds" {
  name             = var.KONG_CRD_HELM_RELEASE_NAME
  repository       = "https://charts.konghq.com"
  chart            = "kong"
  version          = var.KONG_CRD_HELM_CHART_VERSION
  namespace        = var.KONG_CRD_NAMESPACE
  create_namespace = true
  upgrade_install  = true
  skip_crds        = true
  take_ownership   = true
  wait             = true
  timeout          = 300

  values = [
    yamlencode({
      deployment = {
        kong = {
          enabled = false
        }
      }
      ingressController = {
        enabled     = false
        installCRDs = true
      }
      admin = {
        enabled = false
      }
      proxy = {
        enabled = false
      }
      udpProxy = {
        enabled = false
      }
      cluster = {
        enabled = false
      }
      postgresql = {
        enabled = false
      }
      test = {
        enabled = false
      }
    })
  ]
}
