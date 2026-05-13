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
  config_context = var.deploy.K8S_CLUSTER_CONTEXT
}

locals {
  d = var.deploy

  # For genesis-affecting flags, var.env (pod runtime baseline) wins over var.deploy
  # (deployment defaults) because network YAMLs often define them under env: so that
  # both the contract deployment and pod runtime use the same value.
  sponsored_fpc = try(tobool(var.env["SPONSORED_FPC"]), tobool(local.d.SPONSORED_FPC))
  test_accounts = try(tobool(var.env["TEST_ACCOUNTS"]), tobool(local.d.TEST_ACCOUNTS))
  real_verifier = try(tobool(var.env["REAL_VERIFIER"]), tobool(local.d.REAL_VERIFIER))

  deploy_args = concat(
    ["deploy-l1-contracts"],
    ["--l1-rpc-urls", local.d.L1_RPC_URLS],
    ["--private-key", local.d.PRIVATE_KEY],
    ["--l1-chain-id", tostring(tonumber(try(local.d.ETHEREUM_CHAIN_ID, "31337")))],
    ["--validators", local.d.VALIDATORS],
    ["--json"], # Always output JSON for easier parsing
    local.sponsored_fpc ? ["--sponsored-fpc"] : [],
    local.test_accounts ? ["--test-accounts"] : [],
    local.real_verifier ? ["--real-verifier"] : [],
    tobool(try(local.d.VERIFY_CONTRACTS, "false")) ? ["--verify-contracts"] : []
  )

  # Environment variables for the container (omit keys with null values).
  # Merge all env vars from the YAML loader plus NETWORK from the deploy block
  # (NETWORK lives under deploy: in network YAMLs, not env:).
  env_vars = { for k, v in merge(
    var.env,
    { NETWORK = try(local.d.NETWORK, null) }
  ) : k => v if v != null }

  job_name = "${try(local.d.JOB_NAME, "deploy-rollup-contracts")}-${formatdate("YYYY-MM-DD-hhmm", timestamp())}"
}



resource "kubernetes_job_v1" "deploy_rollup_contracts" {
  provider = kubernetes.cluster

  metadata {
    name      = local.job_name
    namespace = local.d.NAMESPACE
    labels = {
      app     = "deploy-rollup-contracts"
      version = split(":", local.d.AZTEC_DOCKER_IMAGE)[1]
    }
  }

  spec {
    backoff_limit              = tonumber(try(local.d.JOB_BACKOFF_LIMIT, "3"))
    ttl_seconds_after_finished = tonumber(try(local.d.JOB_TTL_SECONDS_AFTER_FINISHED, "3600"))

    template {
      metadata {
        labels = {
          app     = "deploy-rollup-contracts"
          version = split(":", local.d.AZTEC_DOCKER_IMAGE)[1]
        }
      }

      spec {
        restart_policy = "Never"

        container {
          name              = "deploy-rollup-contracts"
          image             = local.d.AZTEC_DOCKER_IMAGE
          image_pull_policy = can(regex("^kind-", local.d.K8S_CLUSTER_CONTEXT)) ? "IfNotPresent" : "Always"
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

          env {
            name  = "ETHERSCAN_API_KEY"
            value = try(local.d.ETHERSCAN_API_KEY, null)
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

    # Get the most recent successfully completed pod for the job
    # Filter by Succeeded phase and sort by creation timestamp to get the latest
    POD_NAME=$(kubectl get pods -n ${local.d.NAMESPACE} \
      -l job-name=${kubernetes_job_v1.deploy_rollup_contracts.metadata[0].name} \
      --field-selector=status.phase=Succeeded \
      --sort-by=.metadata.creationTimestamp \
      -o jsonpath='{.items[-1:].metadata.name}')

    if [ -z "$POD_NAME" ]; then
      echo '{}'
      exit 0
    fi

    # Extract logs from the pod
    LOGS=$(kubectl logs $POD_NAME -n ${local.d.NAMESPACE} 2>/dev/null || echo "{}")

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

    # Get the most recent successfully completed pod for the job
    # Filter by Succeeded phase and sort by creation timestamp to get the latest
    POD_NAME=$(kubectl get pods -n ${local.d.NAMESPACE} \
      -l job-name=${kubernetes_job_v1.deploy_rollup_contracts.metadata[0].name} \
      --field-selector=status.phase=Succeeded \
      --sort-by=.metadata.creationTimestamp \
      -o jsonpath='{.items[-1:].metadata.name}')

    if [ -z "$POD_NAME" ]; then
      echo '{"b64":""}'
      exit 0
    fi

    LOGS=$(kubectl logs $POD_NAME -n ${local.d.NAMESPACE} 2>/dev/null || echo "")

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
