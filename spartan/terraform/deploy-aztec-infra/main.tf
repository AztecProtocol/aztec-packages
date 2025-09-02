# Module for deploying Aztec (Layer 2) infrastructure
# Should be configurable/agnostic to
# - network it is deployed to
# - the k8s cluster it is deployed to
# - metrics in use
# - ingress type
# - resource profile


terraform {
  backend "local" {}
  required_providers {
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.16.1"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.24.0"
    }
  }
}

# Only used if deploying an RPC with an external ingress
provider "google" {
  project = var.GCP_PROJECT
  region  = var.GCP_REGION
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

locals {
  aztec_image = {
    repository = split(":", var.AZTEC_DOCKER_IMAGE)[0]
    tag        = split(":", var.AZTEC_DOCKER_IMAGE)[1]
  }

  boot_node_url = "http://${var.RELEASE_PREFIX}-p2p-bootstrap-node.${var.NAMESPACE}.svc.cluster.local:8080"

  # Common settings for all releases
  common_settings = {
    "global.aztecImage.repository"                             = local.aztec_image.repository
    "global.aztecImage.tag"                                    = local.aztec_image.tag
    "global.useGcloudLogging"                                  = true
    "global.customAztecNetwork.registryContractAddress"        = var.REGISTRY_CONTRACT_ADDRESS
    "global.customAztecNetwork.slashFactoryContractAddress"    = var.SLASH_FACTORY_CONTRACT_ADDRESS
    "global.customAztecNetwork.feeAssetHandlerContractAddress" = var.FEE_ASSET_HANDLER_CONTRACT_ADDRESS
    "global.customAztecNetwork.l1ChainId"                      = var.L1_CHAIN_ID
    "global.otelCollectorEndpoint"                             = var.OTEL_COLLECTOR_URL
  }

  common_list_settings = {
    "global.l1ExecutionUrls"              = var.L1_RPC_URLS
    "global.l1ConsensusUrls"              = var.L1_CONSENSUS_HOST_URLS
    "global.l1ConsensusHostApiKeys"       = var.L1_CONSENSUS_HOST_API_KEYS
    "global.l1ConsensusHostApiKeyHeaders" = var.L1_CONSENSUS_HOST_API_KEY_HEADERS
  }

  # Define all releases in a map
  helm_releases = {
    p2p_bootstrap = {
      name  = "${var.RELEASE_PREFIX}-p2p-bootstrap"
      chart = "aztec-node"
      values = [
        "common.yaml",
        "p2p-bootstrap.yaml",
        "p2p-bootstrap-resources-${var.P2P_BOOTSTRAP_RESOURCE_PROFILE}.yaml"
      ]
      custom_settings = {}
      boot_node_path  = ""
    }

    validators = {
      name  = "${var.RELEASE_PREFIX}-validator"
      chart = "aztec-validator"
      values = [
        "common.yaml",
        "validator.yaml",
        "validator-resources-${var.VALIDATOR_RESOURCE_PROFILE}.yaml"
      ]
      custom_settings = {
        "global.customAztecNetwork.enabled" = true
        "validator.mnemonic"                = var.VALIDATOR_MNEMONIC
        "validator.mnemonicStartIndex"      = var.VALIDATOR_MNEMONIC_START_INDEX
        "validator.validatorsPerNode"       = var.VALIDATORS_PER_NODE
        "validator.replicaCount"            = var.VALIDATOR_REPLICAS
      }
      boot_node_path = "validator.node.env.BOOT_NODE_HOST"
    }

    prover = {
      name  = "${var.RELEASE_PREFIX}-prover"
      chart = "aztec-prover-stack"
      values = [
        "common.yaml",
        "prover.yaml",
        "prover-resources-${var.PROVER_RESOURCE_PROFILE}.yaml"
      ]
      custom_settings = {
        "node.mnemonic"           = var.PROVER_MNEMONIC
        "node.mnemonicStartIndex" = var.PROVER_MNEMONIC_START_INDEX
      }
      boot_node_path = "node.node.env.BOOT_NODE_HOST"
    }

    rpc = {
      name  = "${var.RELEASE_PREFIX}-rpc"
      chart = "aztec-node"
      values = [
        "common.yaml",
        "rpc.yaml",
        "rpc-resources-${var.RPC_RESOURCE_PROFILE}.yaml"
      ]
      custom_settings = {}
      boot_node_path  = "node.env.BOOT_NODE_HOST"
    }
  }
}

# Create all helm releases using for_each
resource "helm_release" "releases" {
  for_each = local.helm_releases

  provider         = helm.gke-cluster
  name             = each.value.name
  repository       = "../../"
  chart            = each.value.chart
  namespace        = var.NAMESPACE
  create_namespace = true
  upgrade_install  = true
  force_update     = true
  recreate_pods    = true
  reuse_values     = true
  timeout          = 300
  wait             = false
  wait_for_jobs    = false

  values = [for v in each.value.values : file("./values/${v}")]

  # Common settings
  dynamic "set" {
    for_each = merge(
      local.common_settings,
      each.value.custom_settings,
      # Add boot node if needed
      each.value.boot_node_path != "" ? {
        (each.value.boot_node_path) = local.boot_node_url
      } : {},
      # Add OTEL endpoint if configured and not p2p_bootstrap
      (var.OTEL_COLLECTOR_ENDPOINT != "" && each.key != "p2p_bootstrap") ? {
        "global.otelCollectorEndpoint" = var.OTEL_COLLECTOR_ENDPOINT
      } : {},
      # Add RPC ingress annotation if needed
      (each.key == "rpc" && var.RPC_EXTERNAL_INGRESS && length(google_compute_address.rpc_ingress) > 0) ? {
        "service.ingress.annotations.networking\\.gke\\.io\\/load-balancer-ip-addresses" = google_compute_address.rpc_ingress[0].name
      } : {}
    )
    content {
      name  = set.key
      value = set.value
    }
  }

  # Common list settings
  dynamic "set_list" {
    for_each = local.common_list_settings
    content {
      name  = set_list.key
      value = set_list.value
    }
  }
}

# Keep the Google Compute Address as separate resource
resource "google_compute_address" "rpc_ingress" {
  count        = var.RPC_EXTERNAL_INGRESS ? 1 : 0
  provider     = google
  name         = "${var.NAMESPACE}-${var.RELEASE_PREFIX}-rpc-ingress"
  address_type = "EXTERNAL"
}
