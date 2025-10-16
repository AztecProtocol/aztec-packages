terraform {
  backend "gcs" {
  }
  required_providers {
    helm = {
      source  = "hashicorp/helm"
      version = "~> 3.0.2"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.38.0"
    }
    google = {
      source  = "hashicorp/google"
      version = "~> 7.7.0"
    }
  }
}

provider "kubernetes" {
  alias          = "gke-cluster"
  config_path    = "~/.kube/config"
  config_context = var.k8s_cluster_context
}

provider "helm" {
  alias = "gke-cluster"
  kubernetes = {
    config_path    = "~/.kube/config"
    config_context = var.k8s_cluster_context
  }
}

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

resource "random_bytes" "jwt" {
  length = 32
}

locals {
  eth_panda_ops_repo = "https://ethpandaops.github.io/ethereum-helm-charts"
  reth_name          = "reth" # this the name of the helm installed app

  common = yamlencode({
    replicas = 1
    # we have to mark it as non-sensitive otherwise we can't run for_each on helm_releases :(
    jwt = nonsensitive(random_bytes.jwt.hex)

    resources = {
      requests = {
        cpu    = 2
        memory = "60Gi"
      }
    }

    persistence = {
      enabled          = true
      size             = "2Ti"
      storageClassName = "premium-rwo"
    }

    nodeSelector = {
      "node-type" = "infra"
    }
  })

  helm_releases = tomap({
    reth = {
      name       = local.reth_name
      chart      = "reth"
      repository = local.eth_panda_ops_repo
      version    = var.reth_chart_version
      values = [
        local.common,
        yamlencode({
          image = {
            pullPolicy = "Always"
            repository = split(":", var.reth_image)[0]
            tag        = split(":", var.reth_image)[1]
          }
          p2pNodePort = {
            enabled = true
            port    = var.reth_p2p_port
          }
          extraArgs = [
            "--chain=${var.chain}",
            "--full"
          ]
        })
      ]
    }

    lighthouse = {
      name       = "lighthouse"
      chart      = "lighthouse"
      version    = var.lighthouse_chart_version
      repository = local.eth_panda_ops_repo
      values = [
        local.common,
        yamlencode({
          image = {
            pullPolicy = "Always"
            repository = split(":", var.lighthouse_image)[0]
            tag        = split(":", var.lighthouse_image)[1]
          }
          checkpointSync = {
            enabled = true
            url     = var.checkpoint_sync_url
          }
          p2pNodePort = {
            enabled = true
            port    = var.lighthouse_p2p_port
          }
          extraArgs = [
            "--execution-endpoint=http://${local.reth_name}.${var.namespace}.svc.cluster.local:8551",
            "--supernode",
            "--network=${var.chain}"
          ]
        })
      ]
    }
  })
}

# Create all helm releases using for_each
resource "helm_release" "releases" {
  for_each = { for k, v in local.helm_releases : k => v if v != null }

  provider  = helm.gke-cluster
  namespace = var.namespace

  name       = each.value.name
  repository = each.value.repository
  chart      = each.value.chart
  version    = each.value.version

  values = each.value.values

  create_namespace = true
  force_update     = true
  recreate_pods    = true
  reuse_values     = false
  timeout          = 600
  wait             = false
}
