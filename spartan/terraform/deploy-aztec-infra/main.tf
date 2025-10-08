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

module "web3signer" {
  source                                   = "../modules/web3signer"
  NAMESPACE                                = var.NAMESPACE
  RELEASE_NAME                             = var.RELEASE_PREFIX
  AZTEC_DOCKER_IMAGE                       = var.AZTEC_DOCKER_IMAGE
  CHAIN_ID                                 = var.L1_CHAIN_ID
  MNEMONIC                                 = var.VALIDATOR_MNEMONIC
  ADDRESS_CONFIGMAP_NAME                   = "${var.RELEASE_PREFIX}-attester-addresses"
  ATTESTERS_PER_NODE                       = tonumber(var.VALIDATORS_PER_NODE)
  NODE_COUNT                               = tonumber(var.VALIDATOR_REPLICAS)
  VALIDATOR_MNEMONIC_INDEX_START           = tonumber(var.VALIDATOR_MNEMONIC_START_INDEX)
  VALIDATOR_PUBLISHER_MNEMONIC_INDEX_START = tonumber(var.VALIDATOR_PUBLISHER_MNEMONIC_START_INDEX)
  PROVER_PUBLISHER_MNEMONIC_INDEX_START    = tonumber(var.PROVER_PUBLISHER_MNEMONIC_START_INDEX)
  PROVER_COUNT                             = tonumber(var.PROVER_REPLICAS)
  PUBLISHERS_PER_PROVER                    = tonumber(var.PROVER_PUBLISHERS_PER_PROVER)
  PROVER_PUBLISHER_MNEMONIC_START_INDEX    = tonumber(var.PROVER_PUBLISHER_MNEMONIC_START_INDEX)

  providers = {
    helm       = helm.gke-cluster
    kubernetes = kubernetes.gke-cluster
  }
}

locals {
  aztec_image = {
    repository = split(":", var.AZTEC_DOCKER_IMAGE)[0]
    tag        = split(":", var.AZTEC_DOCKER_IMAGE)[1]
  }

  internal_boot_node_url = var.DEPLOY_INTERNAL_BOOTNODE ? "http://${var.RELEASE_PREFIX}-p2p-bootstrap-node.${var.NAMESPACE}.svc.cluster.local:8080" : ""

  internal_rpc_url       = "http://${var.RELEASE_PREFIX}-rpc-aztec-node.${var.NAMESPACE}.svc.cluster.local:8080"
  internal_rpc_admin_url = "http://${var.RELEASE_PREFIX}-rpc-aztec-node-admin.${var.NAMESPACE}.svc.cluster.local:8880"

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
    "global.sponsoredFPC"                                      = var.SPONSORED_FPC
    "global.testAccounts"                                      = var.TEST_ACCOUNTS
  }

  common_list_settings = {
    "global.l1ExecutionUrls"              = var.L1_RPC_URLS
    "global.l1ConsensusUrls"              = var.L1_CONSENSUS_HOST_URLS
    "global.l1ConsensusHostApiKeys"       = var.L1_CONSENSUS_HOST_API_KEYS
    "global.l1ConsensusHostApiKeyHeaders" = var.L1_CONSENSUS_HOST_API_KEY_HEADERS
  }

  # Define all releases in a map
  helm_releases = {
    snapshot = var.STORE_SNAPSHOT_URL != null ? {
      name   = "${var.RELEASE_PREFIX}-snapshot"
      chart  = "aztec-snapshots"
      values = []
      custom_settings = {
        "snapshots.aztecNodeAdminUrl" = local.internal_rpc_admin_url
        "snapshots.uploadLocation"    = var.STORE_SNAPSHOT_URL
        "snapshots.frequency"         = var.SNAPSHOT_CRON
      }
      boot_node_host_path  = ""
      bootstrap_nodes_path = ""
      wait                 = true
    } : null

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
      boot_node_host_path  = ""
      bootstrap_nodes_path = ""
      wait                 = true
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
        "validator.web3signerUrl"                           = "http://${var.RELEASE_PREFIX}-signer-web3signer.${var.NAMESPACE}.svc.cluster.local:9000/"
        "validator.mnemonic"                                = var.VALIDATOR_MNEMONIC
        "validator.mnemonicStartIndex"                      = var.VALIDATOR_MNEMONIC_START_INDEX
        "validator.validatorsPerNode"                       = var.VALIDATORS_PER_NODE
        "validator.publishersPerValidatorKey"               = var.VALIDATOR_PUBLISHERS_PER_VALIDATOR_KEY
        "validator.publisherMnemonicStartIndex"             = var.VALIDATOR_PUBLISHER_MNEMONIC_START_INDEX
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
        "validator.node.env.NETWORK"                        = var.NETWORK
        "validator.node.env.KEY_INDEX_START"                = var.VALIDATOR_MNEMONIC_START_INDEX
        "validator.node.env.PUBLISHER_KEY_INDEX_START"      = var.VALIDATOR_PUBLISHER_MNEMONIC_START_INDEX
        "validator.node.env.VALIDATORS_PER_NODE"            = var.VALIDATORS_PER_NODE
        "validator.node.env.PUBLISHERS_PER_VALIDATOR_KEY"   = var.VALIDATOR_PUBLISHERS_PER_VALIDATOR_KEY
        "validator.node.proverRealProofs"                   = var.PROVER_REAL_PROOFS
        "validator.node.env.SEQ_MIN_TX_PER_BLOCK"           = var.SEQ_MIN_TX_PER_BLOCK
        "validator.node.env.SEQ_MAX_TX_PER_BLOCK"           = var.SEQ_MAX_TX_PER_BLOCK
        "validator.node.proverRealProofs"                   = var.PROVER_REAL_PROOFS
      }
      boot_node_host_path  = "validator.node.env.BOOT_NODE_HOST"
      bootstrap_nodes_path = "validator.node.env.BOOTSTRAP_NODES"
      wait                 = true
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
        "node.mnemonic"                           = var.PROVER_MNEMONIC
        "node.mnemonicStartIndex"                 = var.PROVER_MNEMONIC_START_INDEX
        "node.node.proverRealProofs"              = var.PROVER_REAL_PROOFS
        "node.web3signerUrl"                      = "http://${var.RELEASE_PREFIX}-signer-web3signer.${var.NAMESPACE}.svc.cluster.local:9000/"
        "node.node.env.NETWORK"                   = var.NETWORK
        "node.node.env.PROVER_FAILED_PROOF_STORE" = var.PROVER_FAILED_PROOF_STORE
        "node.node.env.KEY_INDEX_START"           = var.PROVER_MNEMONIC_START_INDEX
        "node.node.env.PUBLISHER_KEY_INDEX_START" = var.PROVER_PUBLISHER_MNEMONIC_START_INDEX
        "node.node.env.PUBLISHERS_PER_PROVER"     = var.PROVER_PUBLISHERS_PER_PROVER
        "broker.node.proverRealProofs"            = var.PROVER_REAL_PROOFS
        "broker.node.env.NETWORK"                 = var.NETWORK
        "broker.node.env.BOOTSTRAP_NODES"         = "asdf"
        "agent.node.proverRealProofs"             = var.PROVER_REAL_PROOFS
        "agent.node.env.NETWORK"                  = var.NETWORK
        "agent.replicaCount"                      = var.PROVER_REPLICAS
        "agent.node.env.BOOTSTRAP_NODES"          = "asdf"
      }
      boot_node_host_path  = "node.node.env.BOOT_NODE_HOST"
      bootstrap_nodes_path = "node.node.env.BOOTSTRAP_NODES"
      wait                 = true
    }

    rpc = {
      name  = "${var.RELEASE_PREFIX}-rpc"
      chart = "aztec-node"
      values = [
        "common.yaml",
        "rpc.yaml",
        "rpc-resources-${var.RPC_RESOURCE_PROFILE}.yaml"
      ]
      inline_values = var.RPC_INGRESS_ENABLED ? [yamlencode({
        service = {
          rpc = {
            annotations = {
              "cloud.google.com/neg" = jsonencode({ ingress = true })
              "cloud.google.com/backend-config" = jsonencode({
                default = "${var.RELEASE_PREFIX}-rpc-ingress-backend"
              })
            }
          }
        }
        ingress = {
          rpc = {
            annotations = {
              "kubernetes.io/ingress.class"                 = "gce"
              "kubernetes.io/ingress.global-static-ip-name" = var.RPC_INGRESS_STATIC_IP_NAME
              "ingress.gcp.kubernetes.io/pre-shared-cert"   = var.RPC_INGRESS_SSL_CERT_NAME
              "kubernetes.io/ingress.allow-http"            = "false"
            }
          }
        }
      })] : []
      custom_settings = {
        "nodeType"                       = "rpc"
        "node.env.NETWORK"               = var.NETWORK
        "node.proverRealProofs"          = var.PROVER_REAL_PROOFS
        "ingress.rpc.enabled"            = var.RPC_INGRESS_ENABLED
        "ingress.rpc.host"               = var.RPC_INGRESS_HOST
        "node.env.AWS_ACCESS_KEY_ID"     = var.R2_ACCESS_KEY_ID
        "node.env.AWS_SECRET_ACCESS_KEY" = var.R2_SECRET_ACCESS_KEY
      }
      boot_node_host_path  = "node.env.BOOT_NODE_HOST"
      bootstrap_nodes_path = "node.env.BOOTSTRAP_NODES"
      wait                 = true
    }

    archive = var.DEPLOY_ARCHIVAL_NODE ? {
      name  = "${var.RELEASE_PREFIX}-archive"
      chart = "aztec-node"
      values = [
        "common.yaml",
        "archive.yaml",
        "archive-resources-dev.yaml"
      ]
      custom_settings = {
        "nodeType"                       = "archive"
        "node.env.NETWORK"               = var.NETWORK
        "node.env.P2P_ARCHIVED_TX_LIMIT" = "10000000"
      }
      boot_node_host_path  = "node.env.BOOT_NODE_HOST"
      bootstrap_nodes_path = "node.env.BOOTSTRAP_NODES"
      wait                 = true
    } : null

    # Optional: transfer bots
    bot_transfers = var.BOT_TRANSFERS_REPLICAS > 0 ? {
      name  = "${var.RELEASE_PREFIX}-bot-transfers"
      chart = "aztec-bot"
      values = [
        "common.yaml",
        "bot-token-transfer.yaml",
        "bot-resources-${var.BOT_RESOURCE_PROFILE}.yaml",
      ]
      custom_settings = {
        "bot.replicaCount"       = var.BOT_TRANSFERS_REPLICAS
        "bot.txIntervalSeconds"  = var.BOT_TRANSFERS_TX_INTERVAL_SECONDS
        "bot.followChain"        = var.BOT_TRANSFERS_FOLLOW_CHAIN
        "bot.botPrivateKey"      = var.BOT_TRANSFERS_L2_PRIVATE_KEY
        "bot.nodeUrl"            = local.internal_rpc_url
        "bot.mnemonic"           = var.BOT_MNEMONIC
        "bot.mnemonicStartIndex" = var.BOT_TRANSFERS_MNEMONIC_START_INDEX
      }
      boot_node_host_path  = ""
      bootstrap_nodes_path = ""
      wait                 = false
    } : null

    # Optional: AMM swap bots
    bot_swaps = var.BOT_SWAPS_REPLICAS > 0 ? {
      name  = "${var.RELEASE_PREFIX}-bot-swaps"
      chart = "aztec-bot"
      values = [
        "common.yaml",
        "bot-amm-swaps.yaml",
        "bot-resources-${var.BOT_RESOURCE_PROFILE}.yaml",
      ]
      custom_settings = {
        "bot.replicaCount"       = var.BOT_SWAPS_REPLICAS
        "bot.txIntervalSeconds"  = var.BOT_SWAPS_TX_INTERVAL_SECONDS
        "bot.followChain"        = var.BOT_SWAPS_FOLLOW_CHAIN
        "bot.botPrivateKey"      = var.BOT_SWAPS_L2_PRIVATE_KEY
        "bot.nodeUrl"            = local.internal_rpc_url
        "bot.mnemonic"           = var.BOT_MNEMONIC
        "bot.mnemonicStartIndex" = var.BOT_SWAPS_MNEMONIC_START_INDEX
      }
      boot_node_host_path  = ""
      bootstrap_nodes_path = ""
      wait                 = false
    } : null
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
  reuse_values     = false
  timeout          = 600
  wait             = each.value.wait
  wait_for_jobs    = true

  values = concat(
    [for v in each.value.values : file("./values/${v}")],
    lookup(each.value, "inline_values", [])
  )

  # Common settings
  dynamic "set" {
    for_each = { for k, v in merge(
      local.common_settings,
      each.value.custom_settings,
      # Add boot node if needed
      each.value.boot_node_host_path != "" && local.internal_boot_node_url != "" ? {
        (each.value.boot_node_host_path) = local.internal_boot_node_url
      } : {},
      each.value.bootstrap_nodes_path != "" && length(var.EXTERNAL_BOOTNODES) > 0 ? {
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

resource "kubernetes_manifest" "rpc_ingress_backend" {
  count    = var.RPC_INGRESS_ENABLED ? 1 : 0
  provider = kubernetes.gke-cluster

  manifest = {
    apiVersion = "cloud.google.com/v1"
    kind       = "BackendConfig"
    metadata = {
      name      = "${var.RELEASE_PREFIX}-rpc-ingress-backend"
      namespace = var.NAMESPACE
    }
    spec = {
      healthCheck = {
        checkIntervalSec   = 15
        timeoutSec         = 5
        healthyThreshold   = 2
        unhealthyThreshold = 2
        type               = "HTTP"
        port               = 8080
        requestPath        = "/status"
      }
    }
  }
}
