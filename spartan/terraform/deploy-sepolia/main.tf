terraform {
  backend "gcs" {
    bucket = "aztec-terraform"
    prefix = "terraform/state/eth/sepolia"
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
  }
}

provider "kubernetes" {
  alias          = "gke-cluster"
  config_path    = "~/.kube/config"
  config_context = var.K8S_CLUSTER_CONTEXT
}

provider "helm" {
  alias = "gke-cluster"
  kubernetes = {
    config_path    = "~/.kube/config"
    config_context = var.K8S_CLUSTER_CONTEXT
  }
}

resource "random_bytes" "jwt" {
  length = 32
}

locals {
  eth_panda_ops_repo = "https://ethpandaops.github.io/ethereum-helm-charts"

  lighthouse_chart_ver = "1.1.7"
  lighthouse_image     = "sigp/lighthouse:v8.0.0-rc.1" # compatible with Fusaka hardfork

  reth_name      = "reth" # this the name of the helm installed app
  reth_chart_ver = "0.1.6"
  reth_image     = "ghcr.io/paradigmxyz/reth:v1.8.2"

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
      version    = local.reth_chart_ver
      values = [
        local.common,
        yamlencode({
          image = {
            pullPolicy = "Always"
            repository = split(":", local.reth_image)[0]
            tag        = split(":", local.reth_image)[1]
          }
          p2pNodePort = {
            enabled = true
            port    = 32000
          }
          extraArgs = [
            "--chain=sepolia",
            "--full"
          ]
        })
      ]
    }

    lighthouse = {
      name       = "lighthouse"
      chart      = "lighthouse"
      version    = local.lighthouse_chart_ver
      repository = local.eth_panda_ops_repo
      values = [
        local.common,
        yamlencode({
          image = {
            pullPolicy = "Always"
            repository = split(":", local.lighthouse_image)[0]
            tag        = split(":", local.lighthouse_image)[1]
          }
          checkpointSync = {
            enabled = true
            url     = "https://checkpoint-sync.sepolia.ethpandaops.io"
          }
          p2pNodePort = {
            enabled = true
            port    = 32001
          }
          extraArgs = [
            "--execution-endpoint=http://${local.reth_name}.${var.NAMESPACE}.svc.cluster.local:8551",
            "--supernode",
            "--network=sepolia"
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
  namespace = var.NAMESPACE

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
