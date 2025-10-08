terraform {
  # Backend will be configured dynamically in the workflow
  # GCS backend for GKE clusters, local backend for KIND
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.38.0"
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
    ["--private-key", var.PRIVATE_KEY],
    ["--l1-chain-id", tostring(var.L1_CHAIN_ID)],
    ["--validators", var.VALIDATORS],
    ["--json"], # Always output JSON for easier parsing
    ["--create-verification-json", "/tmp/l1-verify"],
    var.SALT != null ? ["--salt", tostring(var.SALT)] : [],
    var.SPONSORED_FPC ? ["--sponsored-fpc"] : [],
    var.TEST_ACCOUNTS ? ["--test-accounts"] : [],
    var.REAL_VERIFIER ? ["--real-verifier"] : []
  )



  # Environment variables for the container (omit keys with null values)
  # if NETWORK is set, ignore the other env vars
  env_vars = var.NETWORK != null ? {
    NETWORK         = var.NETWORK
    LOG_LEVEL       = "debug"
    BOOTSTRAP_NODES = "asdf"
    } : { for k, v in {
      AZTEC_SLOT_DURATION                      = var.AZTEC_SLOT_DURATION
      AZTEC_EPOCH_DURATION                     = var.AZTEC_EPOCH_DURATION
      AZTEC_TARGET_COMMITTEE_SIZE              = var.AZTEC_TARGET_COMMITTEE_SIZE
      AZTEC_PROOF_SUBMISSION_EPOCHS            = var.AZTEC_PROOF_SUBMISSION_EPOCHS
      AZTEC_ACTIVATION_THRESHOLD               = var.AZTEC_ACTIVATION_THRESHOLD
      AZTEC_EJECTION_THRESHOLD                 = var.AZTEC_EJECTION_THRESHOLD
      AZTEC_SLASHING_QUORUM                    = var.AZTEC_SLASHING_QUORUM
      AZTEC_SLASHING_ROUND_SIZE                = var.AZTEC_SLASHING_ROUND_SIZE
      AZTEC_SLASHING_ROUND_SIZE_IN_EPOCHS      = var.AZTEC_SLASHING_ROUND_SIZE_IN_EPOCHS
      AZTEC_SLASHING_LIFETIME_IN_ROUNDS        = var.AZTEC_SLASHING_LIFETIME_IN_ROUNDS
      AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS = var.AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS
      AZTEC_SLASHING_VETOER                    = var.AZTEC_SLASHING_VETOER
      AZTEC_SLASHING_OFFSET_IN_ROUNDS          = var.AZTEC_SLASHING_OFFSET_IN_ROUNDS
      AZTEC_SLASH_AMOUNT_SMALL                 = var.AZTEC_SLASH_AMOUNT_SMALL
      AZTEC_SLASH_AMOUNT_MEDIUM                = var.AZTEC_SLASH_AMOUNT_MEDIUM
      AZTEC_SLASH_AMOUNT_LARGE                 = var.AZTEC_SLASH_AMOUNT_LARGE
      AZTEC_SLASHER_FLAVOR                     = var.AZTEC_SLASHER_FLAVOR
      AZTEC_GOVERNANCE_PROPOSER_QUORUM         = var.AZTEC_GOVERNANCE_PROPOSER_QUORUM
      AZTEC_GOVERNANCE_PROPOSER_ROUND_SIZE     = var.AZTEC_GOVERNANCE_PROPOSER_ROUND_SIZE
      AZTEC_MANA_TARGET                        = var.AZTEC_MANA_TARGET
      AZTEC_PROVING_COST_PER_MANA              = var.AZTEC_PROVING_COST_PER_MANA
      AZTEC_EXIT_DELAY_SECONDS                 = var.AZTEC_EXIT_DELAY_SECONDS
      LOG_LEVEL                                = "debug"
  } : k => v if v != null }

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
          name              = "deploy-rollup-contracts"
          image             = var.AZTEC_DOCKER_IMAGE
          image_pull_policy = "Always"
          command           = ["/bin/sh"]
          args = concat(
            [
              "-lc",
              "set -e; node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js \"$@\"; F=; if [ -f /tmp/l1-verify.json ]; then F=/tmp/l1-verify.json; elif [ -d /tmp/l1-verify ]; then F=$(ls -1t /tmp/l1-verify/*.json 2>/dev/null | head -n1 || true); fi; if [ -n \"$F\" ] && [ -f \"$F\" ]; then echo '[VERIFICATION_JSON_BEGIN]'; cat \"$F\"; echo; echo '[VERIFICATION_JSON_END]'; fi",
              "sh"
            ],
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

    # Consider only logs BEFORE the verification JSON markers (if present)
    BEFORE=$(echo "$LOGS" | sed -n '1,/\[VERIFICATION_JSON_BEGIN\]/p' | sed '$d' || true)
    [ -z "$BEFORE" ] && BEFORE="$LOGS"

    # Extract the final JSON object from logs
    echo "$BEFORE" | grep -v "^\[" | sed -n '/^{$/,/^}$/p' | jq -s '.[-1]'
  EOT
  ]
}

# Extract verification JSON file content printed between markers in deploy job logs
data "external" "verification_json" {
  depends_on = [kubernetes_job_v1.deploy_rollup_contracts]

  program = ["bash", "-c", <<-EOT
    set -e

    POD_NAME=$(kubectl get pods -n ${var.NAMESPACE} -l job-name=${kubernetes_job_v1.deploy_rollup_contracts.metadata[0].name} -o jsonpath='{.items[0].metadata.name}')

    LOGS=$(kubectl logs $POD_NAME -n ${var.NAMESPACE} 2>/dev/null || echo "")

    CONTENT=$(echo "$LOGS" | sed -n '/\[VERIFICATION_JSON_BEGIN\]/,/\[VERIFICATION_JSON_END\]/p' | sed '1d;$d')

    if [ -z "$CONTENT" ]; then
      echo '{"b64":""}'
    else
      B64=$(echo "$CONTENT" | base64 | tr -d '\n')
      echo "{\"b64\":\"$B64\"}"
    fi
  EOT
  ]
}
