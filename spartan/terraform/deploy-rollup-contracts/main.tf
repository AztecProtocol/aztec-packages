terraform {
  # Backend will be configured dynamically in the workflow
  # GCS backend for GKE clusters, local backend for KIND
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.24.0"
    }

  }
}


provider "kubernetes" {
  alias          = "cluster"
  config_path    = "~/.kube/config"
  config_context = var.K8S_CLUSTER_CONTEXT
}

locals {
  # Build the command arguments for deploy-l1-contracts
  deploy_args = concat(
    ["deploy-l1-contracts"],
    ["--l1-rpc-urls", var.L1_RPC_URLS],
    ["--mnemonic", var.MNEMONIC],
    ["--l1-chain-id", tostring(var.L1_CHAIN_ID)],
    ["--validators", var.VALIDATORS],
    ["--json"], # Always output JSON for easier parsing
    var.SALT != null ? ["--salt", tostring(var.SALT)] : [],
    var.SPONSORED_FPC ? ["--sponsored-fpc"] : [],
    var.REAL_VERIFIER ? ["--real-verifier"] : []
  )

  # Environment variables for the container
  env_vars = {
    AZTEC_SLOT_DURATION                  = var.AZTEC_SLOT_DURATION
    AZTEC_EPOCH_DURATION                 = var.AZTEC_EPOCH_DURATION
    AZTEC_TARGET_COMMITTEE_SIZE          = var.AZTEC_TARGET_COMMITTEE_SIZE
    AZTEC_PROOF_SUBMISSION_EPOCHS        = var.AZTEC_PROOF_SUBMISSION_EPOCHS
    AZTEC_ACTIVATION_THRESHOLD           = var.AZTEC_ACTIVATION_THRESHOLD
    AZTEC_EJECTION_THRESHOLD             = var.AZTEC_EJECTION_THRESHOLD
    AZTEC_SLASHING_QUORUM                     = var.AZTEC_SLASHING_QUORUM
    AZTEC_SLASHING_ROUND_SIZE_IN_EPOCHS       = var.AZTEC_SLASHING_ROUND_SIZE_IN_EPOCHS
    AZTEC_SLASHING_LIFETIME_IN_ROUNDS         = var.AZTEC_SLASHING_LIFETIME_IN_ROUNDS
    AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS  = var.AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS
    AZTEC_SLASHING_VETOER                     = var.AZTEC_SLASHING_VETOER
    AZTEC_SLASHING_OFFSET_IN_ROUNDS           = var.AZTEC_SLASHING_OFFSET_IN_ROUNDS
    AZTEC_SLASH_AMOUNT_SMALL                  = var.AZTEC_SLASH_AMOUNT_SMALL
    AZTEC_SLASH_AMOUNT_MEDIUM                 = var.AZTEC_SLASH_AMOUNT_MEDIUM
    AZTEC_SLASH_AMOUNT_LARGE                  = var.AZTEC_SLASH_AMOUNT_LARGE
    AZTEC_SLASHER_FLAVOR                      = var.AZTEC_SLASHER_FLAVOR
    AZTEC_GOVERNANCE_PROPOSER_QUORUM     = var.AZTEC_GOVERNANCE_PROPOSER_QUORUM
    AZTEC_GOVERNANCE_PROPOSER_ROUND_SIZE = var.AZTEC_GOVERNANCE_PROPOSER_ROUND_SIZE
    AZTEC_MANA_TARGET                    = var.AZTEC_MANA_TARGET
    AZTEC_PROVING_COST_PER_MANA          = var.AZTEC_PROVING_COST_PER_MANA
    LOG_LEVEL                            = "debug"
  }

  # Generate a unique job name with timestamp to avoid conflicts
  job_name = "${var.JOB_NAME}-${formatdate("YYYY-MM-DD-hhmm", timestamp())}"
}

resource "kubernetes_job_v1" "deploy_rollup_contracts" {
  provider = kubernetes.cluster

  metadata {
    name      = local.job_name
    namespace = var.NAMESPACE
    labels = {
      app     = "deploy-rollup-contracts"
      version = split(":", var.AZTEC_DOCKER_IMAGE)[1]
    }
  }

  spec {
    backoff_limit              = var.JOB_BACKOFF_LIMIT
    ttl_seconds_after_finished = var.JOB_TTL_SECONDS_AFTER_FINISHED

    template {
      metadata {
        labels = {
          app     = "deploy-rollup-contracts"
          version = split(":", var.AZTEC_DOCKER_IMAGE)[1]
        }
      }

      spec {
        restart_policy = "Never"

        container {
          name    = "deploy-rollup-contracts"
          image   = var.AZTEC_DOCKER_IMAGE
          command = ["node"]
          args = concat(
            ["--no-warnings", "/usr/src/yarn-project/aztec/dest/bin/index.js"],
            local.deploy_args
          )

          # Set environment variables
          dynamic "env" {
            for_each = local.env_vars
            content {
              name  = env.key
              value = env.value
            }
          }

          # Resource limits
          resources {
            limits = {
              cpu    = "2"
              memory = "4Gi"
            }
            requests = {
              cpu    = "1"
              memory = "2Gi"
            }
          }

          # Security context
          security_context {
            run_as_non_root = true
            run_as_user     = 1000
            run_as_group    = 1000
          }
        }

        # Pod security context
        security_context {
          fs_group = 1000
        }
      }
    }

    # Wait for job completion
  }

  wait_for_completion = true

  timeouts {
    create = "10m"
    update = "10m"
  }
}

# Extract JSON output from completed job logs
data "external" "contract_addresses" {
  depends_on = [kubernetes_job_v1.deploy_rollup_contracts]

  program = ["bash", "-c", <<-EOT
    set -e

    # Get pod name for the completed job
    POD_NAME=$(kubectl get pods -n ${var.NAMESPACE} -l job-name=${kubernetes_job_v1.deploy_rollup_contracts.metadata[0].name} -o jsonpath='{.items[0].metadata.name}')

    # Extract logs from the pod
    LOGS=$(kubectl logs $POD_NAME -n ${var.NAMESPACE} 2>/dev/null || echo "{}")

    # Extract the final JSON object from logs
    echo "$LOGS" | grep -v "^\[" | sed -n '/^{$/,/^}$/p' | jq '.'
  EOT
  ]
}
