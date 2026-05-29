terraform {
  required_providers {
    helm = {
      source = "hashicorp/helm"
    }
    kubernetes = {
      source = "hashicorp/kubernetes"
    }
    random = {
      source = "hashicorp/random"
    }
  }
}

# Generate random password if not provided
resource "random_password" "db_password" {
  count   = var.DB_PASSWORD == null ? 1 : 0
  length  = 24
  special = false
}

locals {
  db_password = var.DB_PASSWORD != null ? var.DB_PASSWORD : random_password.db_password[0].result
}

resource "helm_release" "postgres" {
  name             = "${var.RELEASE_NAME}-validator-ha-db"
  repository       = "../../"
  chart            = "aztec-postgres"
  namespace        = var.NAMESPACE
  create_namespace = true
  upgrade_install  = true

  values = [yamlencode({
    auth = {
      database = "validator_ha"
      username = "validator"
      password = local.db_password
    }
    resources = {
      requests = {
        cpu    = var.CPU_REQUEST
        memory = var.MEMORY_REQUEST
      }
      limits = {
        cpu    = var.CPU_LIMIT
        memory = var.MEMORY_LIMIT
      }
    }
    persistence = {
      enabled = true
      size    = var.STORAGE_SIZE
    }
    nodeSelector = {
      "node-type" = "network"
    }
  })]

  timeout       = 300
  wait          = true
  wait_for_jobs = false
}

resource "kubernetes_job_v1" "migrations" {
  metadata {
    name      = "${var.RELEASE_NAME}-validator-ha-db-migrate"
    namespace = var.NAMESPACE
  }

  spec {
    template {
      metadata {}
      spec {
        node_selector = {
          "node-type" = "network"
        }
        container {
          name  = "migrate"
          image = var.AZTEC_DOCKER_IMAGE
          command = [
            "node", "--no-warnings",
            "/usr/src/yarn-project/aztec/dest/bin/index.js",
            "migrate-ha-db", "up"
          ]
          env {
            name  = "DATABASE_URL"
            value = local.database_url
          }
        }
        restart_policy = "OnFailure"
      }
    }
    backoff_limit = 4
  }

  wait_for_completion = true
  timeouts {
    create = "5m"
  }

  depends_on = [helm_release.postgres]
}

locals {
  database_url = "postgresql://validator:${local.db_password}@${var.RELEASE_NAME}-validator-ha-db-postgres.${var.NAMESPACE}.svc.cluster.local:5432/validator_ha"
}
