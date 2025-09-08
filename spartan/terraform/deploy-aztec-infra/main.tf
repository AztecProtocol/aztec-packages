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

locals {
  aztec_image = {
    repository = split(":", var.AZTEC_DOCKER_IMAGE)[0]
    tag        = split(":", var.AZTEC_DOCKER_IMAGE)[1]
  }

  internal_boot_node_url = var.DEPLOY_INTERNAL_BOOTNODE ? "http://${var.RELEASE_PREFIX}-p2p-bootstrap-node.${var.NAMESPACE}.svc.cluster.local:8080" : ""

  # Common settings for all releases
  common_settings = {
    "global.aztecImage.repository"                             = local.aztec_image.repository
    "global.aztecImage.tag"                                    = local.aztec_image.tag
    "global.useGcloudLogging"                                  = true
    "global.customAztecNetwork.registryContractAddress"        = var.REGISTRY_CONTRACT_ADDRESS
    "global.customAztecNetwork.slashFactoryContractAddress"    = var.SLASH_FACTORY_CONTRACT_ADDRESS
    "global.customAztecNetwork.feeAssetHandlerContractAddress" = var.FEE_ASSET_HANDLER_CONTRACT_ADDRESS
    "global.customAztecNetwork.l1ChainId"                      = var.L1_CHAIN_ID
    "global.otelCollectorEndpoint"                             = var.OTEL_COLLECTOR_ENDPOINT
  }

  common_list_settings = {
    "global.l1ExecutionUrls"              = var.L1_RPC_URLS
    "global.l1ConsensusUrls"              = var.L1_CONSENSUS_HOST_URLS
    "global.l1ConsensusHostApiKeys"       = var.L1_CONSENSUS_HOST_API_KEYS
    "global.l1ConsensusHostApiKeyHeaders" = var.L1_CONSENSUS_HOST_API_KEY_HEADERS
  }

  # Define all releases in a map
  helm_releases = {
    p2p_bootstrap = var.DEPLOY_INTERNAL_BOOTNODE ? {
      name  = "${var.RELEASE_PREFIX}-p2p-bootstrap"
      chart = "aztec-node"
      values = [
        "common.yaml",
        "p2p-bootstrap.yaml",
        "p2p-bootstrap-resources-${var.P2P_BOOTSTRAP_RESOURCE_PROFILE}.yaml"
      ]
      custom_settings = {
        "nodeType" = "p2p-bootstrap"
      }
      boot_node_path = ""
    } : null

    validators = {
      name  = "${var.RELEASE_PREFIX}-validator"
      chart = "aztec-validator"
      values = [
        "common.yaml",
        "validator.yaml",
        "validator-resources-${var.VALIDATOR_RESOURCE_PROFILE}.yaml"
      ]
      custom_settings = {
        "global.customAztecNetwork.enabled"                 = true
        "validator.mnemonic"                                = var.VALIDATOR_MNEMONIC
        "validator.mnemonicStartIndex"                      = var.VALIDATOR_MNEMONIC_START_INDEX
        "validator.validatorsPerNode"                       = var.VALIDATORS_PER_NODE
        "validator.replicaCount"                            = var.VALIDATOR_REPLICAS
        "validator.sentinel.enabled"                        = var.SENTINEL_ENABLED
        "validator.slash.minPenaltyPercentage"              = var.SLASH_MIN_PENALTY_PERCENTAGE
        "validator.slash.maxPenaltyPercentage"              = var.SLASH_MAX_PENALTY_PERCENTAGE
        "validator.slash.inactivityTargetPercentage"        = var.SLASH_INACTIVITY_TARGET_PERCENTAGE
        "validator.slash.inactivityPenalty"                 = var.SLASH_INACTIVITY_PENALTY
        "validator.slash.prunePenalty"                      = var.SLASH_PRUNE_PENALTY
        "validator.slash.dataWithholdingPenalty"            = var.SLASH_DATA_WITHHOLDING_PENALTY
        "validator.slash.proposeInvalidAttestationsPenalty" = var.SLASH_PROPOSE_INVALID_ATTESTATIONS_PENALTY
        "validator.slash.attestDescendantOfInvalidPenalty"  = var.SLASH_ATTEST_DESCENDANT_OF_INVALID_PENALTY
        "validator.slash.unknownPenalty"                    = var.SLASH_UNKNOWN_PENALTY
        "validator.slash.invalidBlockPenalty"               = var.SLASH_INVALID_BLOCK_PENALTY
        "validator.slash.offenseExpirationRounds"           = var.SLASH_OFFENSE_EXPIRATION_ROUNDS
        "validator.slash.maxPayloadSize"                    = var.SLASH_MAX_PAYLOAD_SIZE
        "validator.node.env.TRANSACTIONS_DISABLED"          = var.TRANSACTIONS_DISABLED
      }
      boot_node_host_path  = "validator.node.env.BOOT_NODE_HOST"
      bootstrap_nodes_path = "validator.node.env.BOOTSTRAP_NODES"
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
        "node.mnemonic"                = var.PROVER_MNEMONIC
        "node.mnemonicStartIndex"      = var.PROVER_MNEMONIC_START_INDEX
        "node.node.proverRealProofs"   = var.PROVER_REAL_PROOFS
        "broker.node.proverRealProofs" = var.PROVER_REAL_PROOFS
        "agent.node.proverRealProofs"  = var.PROVER_REAL_PROOFS
      }
      boot_node_host_path  = "node.node.env.BOOT_NODE_HOST"
      bootstrap_nodes_path = "node.node.env.BOOTSTRAP_NODES"
    }

    rpc = {
      name  = "${var.RELEASE_PREFIX}-rpc"
      chart = "aztec-node"
      values = [
        "common.yaml",
        "rpc.yaml",
        "rpc-resources-${var.RPC_RESOURCE_PROFILE}.yaml"
      ]
      custom_settings = {
        "nodeType" = "rpc"
      }
      boot_node_host_path  = "node.env.BOOT_NODE_HOST"
      bootstrap_nodes_path = "node.env.BOOTSTRAP_NODES"
    }
  }
}

# Create all helm releases using for_each
resource "helm_release" "releases" {
  for_each = { for k, v in local.helm_releases : k => v if v != null }

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
  timeout          = 600
  wait             = true
  wait_for_jobs    = true

  values = [for v in each.value.values : file("./values/${v}")]

  # Common settings
  dynamic "set" {
    for_each = { for k, v in merge(
      local.common_settings,
      each.value.custom_settings,
      # Add boot node if needed
      each.value.boot_node_host_path != "" && local.internal_boot_node_url != "" ? {
        (each.value.boot_node_host_path) = local.internal_boot_node_url
      } : {},
      each.value.bootstrap_nodes_path != "" && len(var.EXTERNAL_BOOTNODES) > 0 ? {
        (each.value.bootstrap_nodes_path) = join(",", var.EXTERNAL_BOOTNODES)
      } : {}
    ) : k => v if v != null }
    content {
      name  = set.key
      value = set.value
    }
  }

  # Common list settings
  dynamic "set_list" {
    for_each = { for k, v in local.common_list_settings : k => v if v != null }
    content {
      name  = set_list.key
      value = set_list.value
    }
  }
}

