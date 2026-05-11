# Module for deploying Aztec (Layer 2) infrastructure
# Should be configurable/agnostic to
# - network it is deployed to
# - the k8s cluster it is deployed to
# - metrics in use
# - ingress type
# - resource profile
#
# All inputs flow through three structured variables (var.deploy, var.env,
# var.releases) populated by spartan/scripts/deploy_network.sh from the YAML
# loader output + deploy-time-computed values. See variables.tf for details.

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

locals {
  # Shorthand for the deploy block (UPPER_SNAKE keys from YAML + script overrides).
  d = var.deploy

  # Numeric / bool coercions: YAML loader emits all values as strings, so cast
  # at the boundary where main.tf needs typed comparisons or arithmetic.
  validator_replicas         = tonumber(local.d.VALIDATOR_REPLICAS)
  validator_ha_replicas      = tonumber(local.d.VALIDATOR_HA_REPLICAS)
  validator_ha_replica_cnt   = try(tonumber(local.d.VALIDATOR_HA_REPLICA_COUNT), null)
  validators_per_node        = tonumber(local.d.VALIDATORS_PER_NODE)
  validator_pubs_per_replica = tonumber(local.d.VALIDATOR_PUBLISHERS_PER_REPLICA)
  validator_mnemonic_idx     = tonumber(local.d.VALIDATOR_MNEMONIC_START_INDEX)
  validator_pub_mnemonic_idx = tonumber(local.d.VALIDATOR_PUBLISHER_MNEMONIC_START_INDEX)
  prover_replicas            = tonumber(local.d.PROVER_REPLICAS)
  prover_pub_mnemonic_idx    = tonumber(local.d.PROVER_PUBLISHER_MNEMONIC_START_INDEX)
  prover_pubs_per_prover     = tonumber(local.d.PUBLISHERS_PER_PROVER)
  rpc_replicas               = tonumber(local.d.RPC_REPLICAS)
  fisherman_replicas         = tonumber(local.d.FISHERMAN_REPLICAS)
  fisherman_mnemonic_idx     = tonumber(local.d.FISHERMAN_MNEMONIC_START_INDEX)
  full_node_replicas         = tonumber(local.d.FULL_NODE_REPLICAS)
  bot_transfers_replicas     = tonumber(local.d.BOT_TRANSFERS_REPLICAS)
  bot_swaps_replicas         = tonumber(local.d.BOT_SWAPS_REPLICAS)
  bot_cross_chain_replicas   = tonumber(local.d.BOT_CROSS_CHAIN_REPLICAS)
  validator_ha_old_duties_h  = tonumber(local.d.VALIDATOR_HA_OLD_DUTIES_MAX_AGE_H)

  rpc_ingress_enabled  = tobool(local.d.RPC_INGRESS_ENABLED)
  rpc_ingress_log_rate = try(tonumber(local.d.RPC_INGRESS_LOG_SAMPLE_RATE), null)
  deploy_internal_boot = tobool(local.d.DEPLOY_INTERNAL_BOOTNODE)
  deploy_archival_node = tobool(local.d.DEPLOY_ARCHIVAL_NODE)
  prover_no_proof_pub  = tobool(local.d.PROVER_NODE_DISABLE_PROOF_PUBLISH)
  wait_for_prover      = try(tobool(local.d.WAIT_FOR_PROVER_DEPLOY), true)
  p2p_nodeport_enabled = tobool(local.d.P2P_NODEPORT_ENABLED)
  p2p_public_ip        = tobool(local.d.P2P_PUBLIC_IP)

  # Optional strings: "" means "not set" for legacy callers; null when the key
  # may be entirely absent.
  network                    = try(local.d.NETWORK, "")
  store_snapshot_url         = try(local.d.STORE_SNAPSHOT_URL, "")
  blob_file_store_upload_url = try(local.d.BLOB_FILE_STORE_UPLOAD_URL, "")
  prover_agent_image_str     = try(local.d.PROVER_AGENT_DOCKER_IMAGE, "")
  validator_ha_image_str     = try(local.d.VALIDATOR_HA_DOCKER_IMAGE, "")
  otel_endpoint              = try(local.d.OTEL_COLLECTOR_ENDPOINT, "")
  rpc_cloud_armor            = try(local.d.RPC_CLOUD_ARMOR_POLICY_NAME, "")
  rpc_session_affinity       = try(local.d.RPC_INGRESS_SESSION_AFFINITY, "")
  external_bootnodes         = try(local.d.EXTERNAL_BOOTNODES, [])

  # Lists from deploy block (default to []) for L1 endpoints.
  l1_rpc_urls          = try(local.d.L1_RPC_URLS, [])
  l1_consensus_urls    = try(local.d.L1_CONSENSUS_HOST_URLS, [])
  l1_consensus_keys    = try(local.d.L1_CONSENSUS_HOST_API_KEYS, [])
  l1_consensus_headers = try(local.d.L1_CONSENSUS_HOST_API_KEY_HEADERS, [])

  # Network YAMLs set bot tuning under env: (next-net, staging-public, …).
  # Prefer var.env over var.deploy defaults — avoids env→deploy duplication in deploy_network.sh.
  bot_transfers_tx_interval_seconds   = lookup(var.env, "BOT_TRANSFERS_TX_INTERVAL_SECONDS", try(local.d.BOT_TRANSFERS_TX_INTERVAL_SECONDS, ""))
  bot_transfers_follow_chain          = lookup(var.env, "BOT_TRANSFERS_FOLLOW_CHAIN", try(local.d.BOT_TRANSFERS_FOLLOW_CHAIN, ""))
  bot_transfers_pxe_sync_chain_tip    = lookup(var.env, "BOT_TRANSFERS_PXE_SYNC_CHAIN_TIP", try(local.d.BOT_TRANSFERS_PXE_SYNC_CHAIN_TIP, ""))
  bot_swaps_tx_interval_seconds       = lookup(var.env, "BOT_SWAPS_TX_INTERVAL_SECONDS", try(local.d.BOT_SWAPS_TX_INTERVAL_SECONDS, ""))
  bot_swaps_follow_chain              = lookup(var.env, "BOT_SWAPS_FOLLOW_CHAIN", try(local.d.BOT_SWAPS_FOLLOW_CHAIN, ""))
  bot_swaps_pxe_sync_chain_tip        = lookup(var.env, "BOT_SWAPS_PXE_SYNC_CHAIN_TIP", try(local.d.BOT_SWAPS_PXE_SYNC_CHAIN_TIP, ""))
  bot_cross_chain_tx_interval_seconds = lookup(var.env, "BOT_CROSS_CHAIN_TX_INTERVAL_SECONDS", try(local.d.BOT_CROSS_CHAIN_TX_INTERVAL_SECONDS, ""))
  bot_cross_chain_follow_chain        = lookup(var.env, "BOT_CROSS_CHAIN_FOLLOW_CHAIN", try(local.d.BOT_CROSS_CHAIN_FOLLOW_CHAIN, ""))
  bot_cross_chain_pxe_sync_chain_tip  = lookup(var.env, "BOT_CROSS_CHAIN_PXE_SYNC_CHAIN_TIP", try(local.d.BOT_CROSS_CHAIN_PXE_SYNC_CHAIN_TIP, ""))

  # ---------------------------------------------------------------------------
  # Per-release helm values from the YAML loader.
  #
  # `var.releases` is the loader's tfvars output, keyed by the YAML's release
  # block name (validator, prover, rpc, bot_transfers, ...). Wrapper charts
  # (aztec-validator, aztec-bot) alias aztec-node as a subchart, so values
  # must be nested under that alias key (`validator:` / `bot:`) for the env
  # ConfigMap to land in the subchart's `.Values.env`.
  #
  # validators* helm release names (validators, validators-ha-1, ...) all
  # share the loader's single `validator` block as their env baseline; the
  # HA-specific overrides are layered on via custom_settings later.
  #
  # Each key maps to the OBJECT to yamlencode (or {} to skip).
  # ---------------------------------------------------------------------------
  # try() avoids Terraform's strict-type checks on conditionals (var.releases
  # entries have heterogeneous shapes: rpc has env/replicaCount, prover has
  # node/broker/agent, etc.).
  release_values_from_loader = merge(
    # Validator helm releases (validators, validators-ha-N) -> wrap loader's
    # `validator` block under `validator:`.
    {
      for k in keys(local.helm_releases) :
      k => { validator = try(var.releases["validator"], null) }
      if startswith(k, "validators")
    },
    # Bot helm releases -> wrap matching loader block under `bot:`.
    {
      for k in ["bot_transfers", "bot_swaps", "bot_cross_chain"] :
      k => { bot = try(var.releases[k], null) }
    },
    # aztec-node releases (no subchart aliasing) and aztec-prover-stack
    # (subchart structure is already in the loader output as node/broker/agent)
    # are passed through verbatim.
    {
      for k in ["rpc", "archive", "blob_sink", "full_node", "fisherman", "p2p_bootstrap", "prover"] :
      k => try(var.releases[k], null)
    },
  )
}

provider "kubernetes" {
  alias          = "gke-cluster"
  config_path    = "~/.kube/config"
  config_context = local.d.K8S_CLUSTER_CONTEXT
}

provider "helm" {
  alias = "gke-cluster"
  kubernetes {
    config_path    = "~/.kube/config"
    config_context = local.d.K8S_CLUSTER_CONTEXT
  }
}

module "web3signer" {
  # Only deploy web3signer if we have validators or provers that need to publish to L1
  count = local.validator_replicas > 0 ? 1 : 0

  source                                   = "../modules/web3signer"
  NAMESPACE                                = local.d.NAMESPACE
  RELEASE_NAME                             = local.d.RELEASE_PREFIX
  AZTEC_DOCKER_IMAGE                       = local.d.AZTEC_DOCKER_IMAGE
  CHAIN_ID                                 = local.d.L1_CHAIN_ID
  MNEMONIC                                 = local.d.VALIDATOR_MNEMONIC
  ADDRESS_CONFIGMAP_NAME                   = "${local.d.RELEASE_PREFIX}-attester-addresses"
  ATTESTERS_PER_NODE                       = local.validators_per_node
  NODE_COUNT                               = local.max_validator_nodes
  VALIDATOR_HA_REPLICAS                    = local.validator_ha_replicas
  VALIDATOR_MNEMONIC_START_INDEX           = local.validator_mnemonic_idx
  VALIDATOR_PUBLISHER_MNEMONIC_START_INDEX = local.validator_pub_mnemonic_idx
  VALIDATOR_PUBLISHERS_PER_REPLICA         = local.validator_pubs_per_replica
  PROVER_COUNT                             = local.prover_replicas
  PUBLISHERS_PER_PROVER                    = local.prover_pubs_per_prover
  PROVER_PUBLISHER_MNEMONIC_START_INDEX    = local.prover_pub_mnemonic_idx

  providers = {
    helm       = helm.gke-cluster
    kubernetes = kubernetes.gke-cluster
  }
}

module "validator_ha_postgres" {
  # Only deploy HA postgres if we have validators and HA replicas > 0
  count = local.validator_replicas > 0 && local.validator_ha_replicas > 0 ? 1 : 0

  source             = "../modules/validator-ha-postgres"
  NAMESPACE          = local.d.NAMESPACE
  RELEASE_NAME       = local.d.RELEASE_PREFIX
  AZTEC_DOCKER_IMAGE = local.d.AZTEC_DOCKER_IMAGE
  # DB_PASSWORD auto-generated by module

  providers = {
    helm       = helm.gke-cluster
    kubernetes = kubernetes.gke-cluster
  }
}

locals {
  aztec_image = {
    repository = split(":", local.d.AZTEC_DOCKER_IMAGE)[0]
    tag        = split(":", local.d.AZTEC_DOCKER_IMAGE)[1]
  }

  prover_agent_image = local.prover_agent_image_str != "" ? {
    repository = split(":", local.prover_agent_image_str)[0]
    tag        = split(":", local.prover_agent_image_str)[1]
  } : local.aztec_image

  validator_ha_image = local.validator_ha_image_str != "" ? {
    repository = split(":", local.validator_ha_image_str)[0]
    tag        = split(":", local.validator_ha_image_str)[1]
  } : local.aztec_image

  # Max node count: max of primary (VALIDATOR_REPLICAS) and HA pod counts
  # Determines how many attester keystores and publisher key ranges to generate
  effective_ha_count  = local.validator_ha_replicas > 0 ? coalesce(local.validator_ha_replica_cnt, local.validator_replicas) : 0
  max_validator_nodes = max(local.validator_replicas, local.effective_ha_count)

  # Detect local kind context (e.g., "kind-kind") to gate Service types
  is_kind = can(regex("^kind", local.d.K8S_CLUSTER_CONTEXT))

  internal_boot_node_url = local.deploy_internal_boot ? "http://${local.d.RELEASE_PREFIX}-p2p-bootstrap-node.${local.d.NAMESPACE}.svc.cluster.local:8080" : ""

  internal_rpc_url       = "http://${local.d.RELEASE_PREFIX}-rpc-aztec-node.${local.d.NAMESPACE}.svc.cluster.local:8080"
  internal_rpc_admin_url = "http://${local.d.RELEASE_PREFIX}-rpc-aztec-node-admin.${local.d.NAMESPACE}.svc.cluster.local:8880"

  # Pod image is the only thing the chart actually reads from `global` now.
  # Everything else flows under `env:` (mounted via envFrom configmap).
  common_settings = {
    "global.aztecImage.repository" = local.aztec_image.repository
    "global.aztecImage.tag"        = local.aztec_image.tag
    "global.aztecImage.pullPolicy" = local.is_kind ? "IfNotPresent" : "Always"
  }

  # Deploy-time-computed env vars (joined lists, computed paths, secrets,
  # values that come from the L1 deploy step). Per-network YAML values for the
  # same keys take precedence -- this is just the deploy-time fallback.
  #
  # Factored into a plain map so it can be nested under the right chart key:
  #   - aztec-node charts (rpc, archive, p2p_bootstrap, ...): { env: ... }
  #   - aztec-validator (subchart alias `validator`): { validator: { env: ... } }
  #   - aztec-prover-stack (subchart alias `node`): { node: { env: ... } }
  #   - aztec-bot (subchart alias `bot`): { bot: { env: ... } }
  common_env_block = merge(
    {
      USE_GCLOUD_LOGGING                 = "true"
      L1_CHAIN_ID                        = local.d.L1_CHAIN_ID
      REGISTRY_CONTRACT_ADDRESS          = local.d.REGISTRY_CONTRACT_ADDRESS
      FEE_ASSET_HANDLER_CONTRACT_ADDRESS = local.d.FEE_ASSET_HANDLER_CONTRACT_ADDRESS
      SPONSORED_FPC                      = tostring(local.d.SPONSORED_FPC)
      TEST_ACCOUNTS                      = tostring(local.d.TEST_ACCOUNTS)
      LOG_JSON                           = "1"
    },
    local.network != "" ? { NETWORK = local.network } : {},
    length(local.l1_rpc_urls) > 0 ? { ETHEREUM_HOSTS = join(",", local.l1_rpc_urls) } : {},
    length(local.l1_consensus_urls) > 0 ? {
      L1_CONSENSUS_HOST_URLS = join(",", local.l1_consensus_urls)
    } : {},
    length(local.l1_consensus_keys) > 0 ? {
      L1_CONSENSUS_HOST_API_KEYS = join(",", local.l1_consensus_keys)
    } : {},
    length(local.l1_consensus_headers) > 0 ? {
      L1_CONSENSUS_HOST_API_KEY_HEADERS = join(",", local.l1_consensus_headers)
    } : {},
    local.otel_endpoint != "" ? {
      OTEL_EXPORTER_OTLP_METRICS_ENDPOINT = "${local.otel_endpoint}/v1/metrics"
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT  = "${local.otel_endpoint}/v1/traces"
      OTEL_EXPORTER_OTLP_LOGS_ENDPOINT    = "${local.otel_endpoint}/v1/logs"
    } : {}
  )

  # Per-chart-type inline values that carry common_env_block to the right Helm key.
  # aztec-node releases (rpc, archive, blob_sink, full_node, fisherman, p2p_bootstrap):
  #   top-level `env:` lands in .Values.env → env-from-values ConfigMap.
  common_inline_values = yamlencode({ env = local.common_env_block })
  # aztec-validator: env must be under `validator.env` to reach the subchart's .Values.env.
  common_inline_values_validator = yamlencode({ validator = { env = local.common_env_block } })
  # aztec-prover-stack: env must be under each sub-component's env.
  common_inline_values_prover = yamlencode({
    node   = { env = local.common_env_block }
    broker = { env = local.common_env_block }
    agent  = { env = local.common_env_block }
  })
  # aztec-bot: env must be under `bot.env` to reach the subchart's .Values.env.
  common_inline_values_bot = yamlencode({ bot = { env = local.common_env_block } })

  common_list_settings = {}

  # Generate a set of _external_ host ports to use for P2P
  # K8s will use these values to schedule pods on appropriate machines. Using random ports here will allow it to
  # colocate pods from different services or even pods from different networks onto the same physical machine
  # (so long as the VM has enough resources)
  p2p_port_p2p_bootstrap = 40400 + (parseint(substr(md5("${local.d.NAMESPACE}-p2p-bootstrap"), 0, 4), 16) % 100)
  p2p_port_prover        = 40400 + (parseint(substr(md5("${local.d.NAMESPACE}-prover"), 0, 4), 16) % 100)
  p2p_port_rpc           = 40400 + (parseint(substr(md5("${local.d.NAMESPACE}-rpc"), 0, 4), 16) % 100)
  p2p_port_fisherman     = 40400 + (parseint(substr(md5("${local.d.NAMESPACE}-fisherman"), 0, 4), 16) % 100)
  p2p_port_full_node     = 40400 + (parseint(substr(md5("${local.d.NAMESPACE}-full-node"), 0, 4), 16) % 100)
  p2p_port_archive       = 40400 + (parseint(substr(md5("${local.d.NAMESPACE}-archive"), 0, 4), 16) % 100)

  p2p_port_validators = {
    for idx in range(1 + local.validator_ha_replicas) : idx => 40400 + (parseint(substr(md5("${local.d.NAMESPACE}-validator-${idx}"), 0, 4), 16) % 100)
  }

  # Validator configuration - extracted for dynamic HA release generation
  validator_base_config = {
    chart   = "aztec-validator"
    timeout = 1800
    values = [
      "common.yaml",
      "validator.yaml",
      "validator-resources-${local.d.VALIDATOR_RESOURCE_PROFILE}.yaml"
    ]
    inline_values = [yamlencode({
      validator = {
        service = {
          p2p = { publicIP = local.p2p_public_ip }
        }
        # spread validator pods to different nodes to avoid having two validators with the same attester keys on the same physical node
        topologySpreadConstraints = [{
          maxSkew           = 1
          topologyKey       = "kubernetes.io/hostname"
          whenUnsatisfiable = "ScheduleAnyway" # soft constraint
          labelSelector = {
            matchLabels = {
              "app.kubernetes.io/component" = "sequencer-node"
            }
          }
          matchLabelKeys = ["apps.kubernetes.io/pod-index"]
        }]
      }
    })]
    boot_node_host_path  = "validator.node.env.BOOT_NODE_HOST"
    bootstrap_nodes_path = "validator.node.env.BOOTSTRAP_NODES"
    wait                 = true
  }

  # Per-pod env vars now flow from spartan/environments/networks/<name>.yml via
  # the loader's pre-merged var.releases.validators.env block (passed through
  # main.tf's `inline_values = [yamlencode(var.releases[each.key])]`). Only
  # values that are computed at deploy time, set k8s manifest shape, or rename
  # one chart key into a different pod env name remain here.
  validator_common_settings = {
    # K8s shape / cluster decisions (not pod env).
    "validator.service.p2p.nodePortEnabled" = local.p2p_nodeport_enabled
    "validator.web3signerUrl"               = "http://${local.d.RELEASE_PREFIX}-signer-web3signer.${local.d.NAMESPACE}.svc.cluster.local:9000/"
    "validator.mnemonic"                    = local.d.VALIDATOR_MNEMONIC
    "validator.mnemonicStartIndex"          = local.validator_mnemonic_idx
    "validator.validatorsPerNode"           = local.validators_per_node
    "validator.publishersPerReplica"        = local.validator_pubs_per_replica
    "validator.publisherMnemonicStartIndex" = local.validator_pub_mnemonic_idx
    "validator.node.secret.envEnabled"      = true
    "validator.node.secret.mnemonic"        = local.d.VALIDATOR_MNEMONIC
    "validator.node.secret.mnemonicIndex"   = local.validator_mnemonic_idx
    "validator.node.adminApiKeyHash"        = local.d.ADMIN_API_KEY_HASH
    # Renames: chart-side var name differs from pod env name.
    "validator.node.env.KEY_INDEX_START"           = local.validator_mnemonic_idx
    "validator.node.env.PUBLISHER_KEY_INDEX_START" = local.validator_pub_mnemonic_idx
  }

  # Note: nonsensitive() is required here because helm_releases is used in for_each,
  # and sensitive values cannot be used as for_each keys. The database URL will be
  # passed to pods as an env var, which is the intended behavior.
  validator_ha_settings = local.validator_ha_replicas > 0 ? {
    "validator.node.env.VALIDATOR_HA_SIGNING_ENABLED" = "true"
    "validator.node.env.VALIDATOR_HA_DATABASE_URL"    = nonsensitive(module.validator_ha_postgres[0].database_url)
    # Limit pool size per pod to avoid exhausting PostgreSQL connections
    # With 12 pods × 5 max = 60 connections (well under PostgreSQL's 500 max)
    "validator.node.env.VALIDATOR_HA_POOL_MAX"             = "5"
    "validator.node.env.VALIDATOR_HA_OLD_DUTIES_MAX_AGE_H" = tostring(local.validator_ha_old_duties_h)
  } : {}

  # Generate validator releases: primary (idx=0) plus N HA replicas (idx=1..N)
  validator_releases = local.validator_replicas > 0 ? {
    for idx in range(1 + local.validator_ha_replicas) :
    "validators${idx > 0 ? "-ha-${idx}" : ""}" => merge(local.validator_base_config, {
      name = "${local.d.RELEASE_PREFIX}-validator${idx > 0 ? "-ha-${idx}" : ""}"
      custom_settings = merge(
        local.validator_common_settings,
        local.validator_ha_settings,
        {
          "validator.replicaCount"                        = idx > 0 ? coalesce(local.validator_ha_replica_cnt, local.validator_replicas) : local.validator_replicas
          "validator.node.env.VALIDATOR_HA_REPLICA_INDEX" = tostring(idx)
          "validator.node.env.PUBLISHER_KEY_INDEX_START"  = local.validator_pub_mnemonic_idx + (idx * (local.validator_pubs_per_replica * local.max_validator_nodes))
          "validator.service.p2p.announcePort"            = local.p2p_port_validators[idx]
          "validator.service.p2p.port"                    = local.p2p_port_validators[idx]
        },
        # Override image for HA releases (idx > 0) when VALIDATOR_HA_DOCKER_IMAGE is set
        idx > 0 && local.validator_ha_image_str != "" ? {
          "global.aztecImage.repository" = local.validator_ha_image.repository
          "global.aztecImage.tag"        = local.validator_ha_image.tag
        } : {}
      )
    })
  } : {}

  # Define all releases in a map
  helm_releases = merge({
    snapshot = local.store_snapshot_url != "" ? {
      name   = "${local.d.RELEASE_PREFIX}-snapshot"
      chart  = "aztec-snapshots"
      values = []
      custom_settings = {
        "snapshots.aztecNodeAdminUrl" = local.internal_rpc_admin_url
        "snapshots.uploadLocation"    = local.store_snapshot_url
        "snapshots.frequency"         = try(local.d.SNAPSHOT_CRON, "0 */12 * * *")
      }
      boot_node_host_path  = ""
      bootstrap_nodes_path = ""
      wait                 = true
    } : null

    p2p_bootstrap = local.deploy_internal_boot ? {
      name  = "${local.d.RELEASE_PREFIX}-p2p-bootstrap"
      chart = "aztec-node"
      values = [
        "common.yaml",
        "p2p-bootstrap.yaml",
        "p2p-bootstrap-resources-${local.d.P2P_BOOTSTRAP_RESOURCE_PROFILE}.yaml"
      ]
      inline_values = [yamlencode({
        service = {
          p2p = { publicIP = local.p2p_public_ip }
        }
      })]
      custom_settings = merge({
        "nodeType"                    = "p2p-bootstrap"
        "service.p2p.nodePortEnabled" = local.p2p_nodeport_enabled
        "service.p2p.announcePort"    = local.p2p_port_p2p_bootstrap
        "service.p2p.port"            = local.p2p_port_p2p_bootstrap
        }, try(local.d.P2P_MAX_PENDING_TX_COUNT, "") != "" ? {
        "node.env.P2P_MAX_PENDING_TX_COUNT" = local.d.P2P_MAX_PENDING_TX_COUNT
      } : {})
      boot_node_host_path  = ""
      bootstrap_nodes_path = ""
      wait                 = true
    } : null

    prover = {
      name  = "${local.d.RELEASE_PREFIX}-prover"
      chart = "aztec-prover-stack"
      values = [
        "common.yaml",
        "prover.yaml",
        "prover-resources-${local.d.PROVER_RESOURCE_PROFILE}.yaml"
      ]
      inline_values = concat([yamlencode({
        node = {
          service = {
            p2p = { publicIP = local.p2p_public_ip }
          }
        }
        })], local.is_kind ? [yamlencode({
        agent = {
          nodeSelector = null
          affinity     = null
          tolerations  = null
        }
      })] : [])
      # Per-pod env vars flow from spartan/environments/networks/<name>.yml via
      # the loader's pre-merged var.releases.prover.{node,broker,agent}.env blocks.
      # Only computed/renamed/secret values remain here.
      custom_settings = merge(
        {
          # Chart-shape / k8s shape.
          "node.mnemonic"                    = local.d.PROVER_MNEMONIC
          "node.mnemonicStartIndex"          = local.prover_pub_mnemonic_idx
          "node.node.secret.envEnabled"      = true
          "node.node.secret.mnemonic"        = local.d.PROVER_MNEMONIC
          "node.node.secret.mnemonicIndex"   = local.prover_pub_mnemonic_idx
          "node.service.p2p.nodePortEnabled" = local.p2p_nodeport_enabled
          "node.service.p2p.announcePort"    = local.p2p_port_prover
          "node.service.p2p.port"            = local.p2p_port_prover
          "agent.replicaCount"               = local.prover_replicas
          "agent.node.image.repository"      = local.prover_agent_image.repository
          "agent.node.image.tag"             = local.prover_agent_image.tag
          # Renames: chart-side var name differs from pod env name.
          "node.node.env.KEY_INDEX_START"           = local.prover_pub_mnemonic_idx
          "node.node.env.PUBLISHER_KEY_INDEX_START" = local.prover_pub_mnemonic_idx
        },
        try(local.d.PROVER_AGENT_INCLUDE_METRICS, "") != "" ? {
          "agent.env.OTEL_INCLUDE_METRICS" = local.d.PROVER_AGENT_INCLUDE_METRICS
        } : {},
        # Only set web3signerUrl if proof publishing is enabled
        !local.prover_no_proof_pub ? {
          "node.node.web3signerUrl" = "http://${local.d.RELEASE_PREFIX}-signer-web3signer.${local.d.NAMESPACE}.svc.cluster.local:9000/"
        } : {}
      )
      boot_node_host_path  = "node.node.env.BOOT_NODE_HOST"
      bootstrap_nodes_path = "node.node.env.BOOTSTRAP_NODES"
      wait                 = local.wait_for_prover
    }

    rpc = {
      name  = "${local.d.RELEASE_PREFIX}-rpc"
      chart = "aztec-node"
      values = [
        "common.yaml",
        "rpc.yaml",
        "rpc-resources-${local.d.RPC_RESOURCE_PROFILE}.yaml"
      ]
      inline_values = concat(local.rpc_ingress_enabled ? [yamlencode({
        service = {
          p2p = { publicIP = local.p2p_public_ip }
          rpc = {
            annotations = {
              "cloud.google.com/neg" = jsonencode({ ingress = true })
              "cloud.google.com/backend-config" = jsonencode({
                default = "${local.d.RELEASE_PREFIX}-rpc-ingress-backend"
              })
            }
          }
        }
        ingress = {
          rpc = {
            hosts = local.d.RPC_INGRESS_HOSTS
            annotations = {
              "kubernetes.io/ingress.class"                 = "gce"
              "kubernetes.io/ingress.global-static-ip-name" = local.d.RPC_INGRESS_STATIC_IP_NAME
              "ingress.gcp.kubernetes.io/pre-shared-cert"   = join(",", local.d.RPC_INGRESS_SSL_CERT_NAMES)
              "kubernetes.io/ingress.allow-http"            = "false"
            }
          }
        }
        })] : [yamlencode({
        service = {
          p2p = { publicIP = local.p2p_public_ip }
          rpc = {
            enabled = true
            type    = local.is_kind ? "ClusterIP" : "LoadBalancer"
          }
        }
      })])

      # Pod env vars flow from var.releases.rpc.env via inline_values.
      custom_settings = {
        "replicaCount"                = local.rpc_replicas
        "service.p2p.nodePortEnabled" = local.p2p_nodeport_enabled
        "service.p2p.announcePort"    = local.p2p_port_rpc
        "service.p2p.port"            = local.p2p_port_rpc
        "ingress.rpc.enabled"         = local.rpc_ingress_enabled
      }
      boot_node_host_path  = "node.env.BOOT_NODE_HOST"
      bootstrap_nodes_path = "node.env.BOOTSTRAP_NODES"
      wait                 = true
    }

    fisherman = local.fisherman_replicas > 0 ? {
      name  = "${local.d.RELEASE_PREFIX}-fisherman"
      chart = "aztec-node"
      values = [
        "common.yaml",
        "rpc.yaml",
        "rpc-resources-${local.d.RPC_RESOURCE_PROFILE}.yaml"
      ]
      inline_values = [yamlencode({
        service = {
          p2p = { publicIP = local.p2p_public_ip }
        }
      })]
      # Pod env vars flow from var.releases.fisherman.env via inline_values
      # (FISHERMAN_MODE, SEQ_BUILD_CHECKPOINT_IF_EMPTY, VALIDATORS_PER_NODE
      # come from _release_defaults.fisherman.env in network-defaults.yml).
      custom_settings = {
        "replicaCount"                = local.fisherman_replicas
        "service.p2p.nodePortEnabled" = local.p2p_nodeport_enabled
        "service.p2p.announcePort"    = local.p2p_port_fisherman
        "service.p2p.port"            = local.p2p_port_fisherman
        "node.secret.envEnabled"      = true
        "node.secret.mnemonic"        = local.d.FISHERMAN_MNEMONIC
        "node.secret.mnemonicIndex"   = local.fisherman_mnemonic_idx
        "node.preStartScript"         = "source /scripts/get-private-key.sh"
        # Rename: chart-side var name differs from pod env name.
        "node.env.KEY_INDEX_START" = local.fisherman_mnemonic_idx
      }
      boot_node_host_path  = "node.env.BOOT_NODE_HOST"
      bootstrap_nodes_path = "node.env.BOOTSTRAP_NODES"
      wait                 = true
    } : null

    full_node = local.full_node_replicas > 0 ? {
      name  = "${local.d.RELEASE_PREFIX}-full-node"
      chart = "aztec-node"
      values = [
        "common.yaml",
        "full-node.yaml",
        "full-node-resources-${local.d.FULL_NODE_RESOURCE_PROFILE}.yaml"
      ]
      inline_values = [yamlencode({
        service = {
          p2p = { publicIP = local.p2p_public_ip }
        }
      })]
      # Pod env vars flow from var.releases.full_node.env via inline_values.
      custom_settings = merge({
        "nodeType"                    = "full-node"
        "replicaCount"                = local.full_node_replicas
        "service.p2p.nodePortEnabled" = local.p2p_nodeport_enabled
        "service.p2p.announcePort"    = local.p2p_port_full_node
        "service.p2p.port"            = local.p2p_port_full_node
        }, try(local.d.FULL_NODE_INCLUDE_METRICS, "") != "" ? {
        "env.OTEL_INCLUDE_METRICS" = local.d.FULL_NODE_INCLUDE_METRICS
      } : {})
      boot_node_host_path  = "node.env.BOOT_NODE_HOST"
      bootstrap_nodes_path = "node.env.BOOTSTRAP_NODES"
      // this Helm app will have lots of replicas, if we wait for all to come online we'll surely time out.
      wait = false
    } : null

    archive = local.deploy_archival_node ? {
      name  = "${local.d.RELEASE_PREFIX}-archive"
      chart = "aztec-node"
      values = [
        "common.yaml",
        "archive.yaml",
        "archive-resources-${local.d.ARCHIVE_RESOURCE_PROFILE}.yaml"
      ]
      inline_values = [yamlencode({
        service = {
          p2p = { publicIP = local.p2p_public_ip }
        }
      })]
      # Pod env vars flow from var.releases.archive.env via inline_values.
      # P2P_ARCHIVED_TX_LIMIT is set in _release_defaults.archive.env.
      custom_settings = {
        "nodeType"                    = "archive"
        "service.p2p.nodePortEnabled" = local.p2p_nodeport_enabled
        "service.p2p.announcePort"    = local.p2p_port_archive
        "service.p2p.port"            = local.p2p_port_archive
      }
      boot_node_host_path  = "node.env.BOOT_NODE_HOST"
      bootstrap_nodes_path = "node.env.BOOTSTRAP_NODES"
      wait                 = true
    } : null

    # Blob sink: uploads blobs to filestore as it syncs
    blob_sink = local.blob_file_store_upload_url != "" ? {
      name  = "${local.d.RELEASE_PREFIX}-blob-sink"
      chart = "aztec-node"
      values = [
        "common.yaml",
        "blob-sink.yaml",
        "blob-sink-resources-${local.d.BLOB_SINK_RESOURCE_PROFILE}.yaml"
      ]
      inline_values = [yamlencode({
        service = {
          p2p = { publicIP = local.p2p_public_ip }
        }
      })]
      # Pod env vars flow from var.releases.blob_sink.env via inline_values.
      custom_settings = {
        "nodeType"                    = "blob-sink"
        "service.p2p.nodePortEnabled" = local.p2p_nodeport_enabled
        # Deploy-time computed (not in YAML): the upload URL depends on R2 account ID + bucket dir.
        "node.env.BLOB_FILE_STORE_UPLOAD_URL" = local.blob_file_store_upload_url
      }
      boot_node_host_path  = "node.env.BOOT_NODE_HOST"
      bootstrap_nodes_path = "node.env.BOOTSTRAP_NODES"
      wait                 = true
    } : null

    # Optional: transfer bots
    bot_transfers = local.bot_transfers_replicas > 0 ? {
      name  = "${local.d.RELEASE_PREFIX}-bot-transfers"
      chart = "aztec-bot"
      values = [
        "common.yaml",
        "bot-token-transfer.yaml",
        "bot-resources-${local.d.BOT_RESOURCE_PROFILE}.yaml",
      ]
      custom_settings = merge(
        {
          "bot.replicaCount"                = local.bot_transfers_replicas
          "bot.env.BOT_TX_INTERVAL_SECONDS" = local.bot_transfers_tx_interval_seconds
          "bot.env.BOT_FOLLOW_CHAIN"        = local.bot_transfers_follow_chain
          "bot.env.PXE_SYNC_CHAIN_TIP"      = local.bot_transfers_pxe_sync_chain_tip
          "bot.env.AZTEC_NODE_URL"          = local.internal_rpc_url
          "bot.botPrivateKey"               = try(local.d.BOT_TRANSFERS_L2_PRIVATE_KEY, "0xcafe01")
          "bot.mnemonic"                    = local.d.BOT_MNEMONIC
          "bot.mnemonicStartIndex"          = local.d.BOT_TRANSFERS_MNEMONIC_START_INDEX
        },
        try(local.d.BOT_DA_GAS_LIMIT, "") != "" ? { "bot.env.BOT_DA_GAS_LIMIT" = local.d.BOT_DA_GAS_LIMIT } : {},
        try(local.d.BOT_L2_GAS_LIMIT, "") != "" ? { "bot.env.BOT_L2_GAS_LIMIT" = local.d.BOT_L2_GAS_LIMIT } : {},
      )
      boot_node_host_path  = ""
      bootstrap_nodes_path = ""
      wait                 = false
    } : null

    # Optional: AMM swap bots
    bot_swaps = local.bot_swaps_replicas > 0 ? {
      name  = "${local.d.RELEASE_PREFIX}-bot-swaps"
      chart = "aztec-bot"
      values = [
        "common.yaml",
        "bot-amm-swaps.yaml",
        "bot-resources-${local.d.BOT_RESOURCE_PROFILE}.yaml",
      ]
      custom_settings = merge(
        {
          "bot.replicaCount"                = local.bot_swaps_replicas
          "bot.env.BOT_TX_INTERVAL_SECONDS" = local.bot_swaps_tx_interval_seconds
          "bot.env.BOT_FOLLOW_CHAIN"        = local.bot_swaps_follow_chain
          "bot.env.PXE_SYNC_CHAIN_TIP"      = local.bot_swaps_pxe_sync_chain_tip
          "bot.env.AZTEC_NODE_URL"          = local.internal_rpc_url
          "bot.botPrivateKey"               = try(local.d.BOT_SWAPS_L2_PRIVATE_KEY, "0xcafe02")
          "bot.mnemonic"                    = local.d.BOT_MNEMONIC
          "bot.mnemonicStartIndex"          = local.d.BOT_SWAPS_MNEMONIC_START_INDEX
        },
        try(local.d.BOT_DA_GAS_LIMIT, "") != "" ? { "bot.env.BOT_DA_GAS_LIMIT" = local.d.BOT_DA_GAS_LIMIT } : {},
        try(local.d.BOT_L2_GAS_LIMIT, "") != "" ? { "bot.env.BOT_L2_GAS_LIMIT" = local.d.BOT_L2_GAS_LIMIT } : {},
      )
      boot_node_host_path  = ""
      bootstrap_nodes_path = ""
      wait                 = false
    } : null

    # Optional: cross-chain message bots
    bot_cross_chain = local.bot_cross_chain_replicas > 0 ? {
      name  = "${local.d.RELEASE_PREFIX}-bot-cross-chain"
      chart = "aztec-bot"
      values = [
        "common.yaml",
        "bot-cross-chain.yaml",
        "bot-resources-${local.d.BOT_RESOURCE_PROFILE}.yaml",
      ]
      custom_settings = merge(
        {
          "bot.replicaCount"                = local.bot_cross_chain_replicas
          "bot.env.BOT_TX_INTERVAL_SECONDS" = local.bot_cross_chain_tx_interval_seconds
          "bot.env.BOT_FOLLOW_CHAIN"        = local.bot_cross_chain_follow_chain
          "bot.env.PXE_SYNC_CHAIN_TIP"      = local.bot_cross_chain_pxe_sync_chain_tip
          "bot.env.AZTEC_NODE_URL"          = local.internal_rpc_url
          "bot.botPrivateKey"               = try(local.d.BOT_CROSS_CHAIN_L2_PRIVATE_KEY, "0xcafe03")
          "bot.mnemonic"                    = local.d.BOT_MNEMONIC
          "bot.mnemonicStartIndex"          = local.d.BOT_CROSS_CHAIN_MNEMONIC_START_INDEX
        },
        try(local.d.BOT_DA_GAS_LIMIT, "") != "" ? { "bot.env.BOT_DA_GAS_LIMIT" = local.d.BOT_DA_GAS_LIMIT } : {},
        try(local.d.BOT_L2_GAS_LIMIT, "") != "" ? { "bot.env.BOT_L2_GAS_LIMIT" = local.d.BOT_L2_GAS_LIMIT } : {},
      )
      boot_node_host_path  = ""
      bootstrap_nodes_path = ""
      wait                 = false
    } : null
  }, local.validator_releases)
}

# Create all helm releases using for_each
resource "helm_release" "releases" {
  for_each = { for k, v in local.helm_releases : k => v if v != null }

  provider         = helm.gke-cluster
  name             = each.value.name
  repository       = "../../"
  chart            = each.value.chart
  namespace        = local.d.NAMESPACE
  create_namespace = true
  upgrade_install  = true
  force_update     = true
  recreate_pods    = true
  reuse_values     = false
  timeout          = lookup(each.value, "timeout", 600)
  wait             = each.value.wait
  wait_for_jobs    = true

  # Pick the right common_inline_values variant for this chart type.
  # Wrapper charts (aztec-validator, aztec-bot, aztec-prover-stack) alias
  # aztec-node as a subchart; env vars must be nested under the alias key
  # or they're lost (they land on the wrapper's .Values.env which no
  # template consumes).
  values = concat(
    [for v in each.value.values : file("./values/${v}")],
    [
      startswith(each.key, "validators") ? local.common_inline_values_validator :
      each.key == "prover" ? local.common_inline_values_prover :
      startswith(each.key, "bot_") ? local.common_inline_values_bot :
      local.common_inline_values
    ],
    lookup(each.value, "inline_values", []),
    # Per-release Helm values from the YAML loader. See `local.release_values_from_loader`
    # for the wrapping/lookup rules (handles wrapper charts and validators-*<->validator
    # name mismatch). null/missing means "no loader values for this release".
    try(local.release_values_from_loader[each.key], null) != null ?
    [yamlencode(local.release_values_from_loader[each.key])] : []
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
      each.value.bootstrap_nodes_path != "" && length(local.external_bootnodes) > 0 ? {
        (each.value.bootstrap_nodes_path) = join(",", local.external_bootnodes)
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
  count    = local.rpc_ingress_enabled ? 1 : 0
  provider = kubernetes.gke-cluster

  manifest = {
    apiVersion = "cloud.google.com/v1"
    kind       = "BackendConfig"
    metadata = {
      name      = "${local.d.RELEASE_PREFIX}-rpc-ingress-backend"
      namespace = local.d.NAMESPACE
    }
    spec = merge(
      {
        healthCheck = {
          checkIntervalSec   = 15
          timeoutSec         = 5
          healthyThreshold   = 2
          unhealthyThreshold = 2
          type               = "HTTP"
          port               = 8080
          requestPath        = "/status"
        }
      },
      local.rpc_cloud_armor != "" ? {
        securityPolicy = {
          name = local.rpc_cloud_armor
        }
      } : {},
      local.rpc_session_affinity != "" ? {
        sessionAffinity = {
          affinityType = local.rpc_session_affinity
        }
      } : {},
      local.rpc_ingress_log_rate != null ? {
        logging = {
          enable     = true
          sampleRate = local.rpc_ingress_log_rate
        }
      } : {}
    )
  }
}
