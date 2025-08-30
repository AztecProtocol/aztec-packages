terraform {
  backend "gcs" {
    bucket = "aztec-terraform"
    prefix = "network-deploy/us-west1-a/aztec-gke-public/testnet/terraform.tfstate"
  }
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

provider "google" {
  project = var.GCP_PROJECT_ID
  region  = var.GCP_REGION
}

provider "kubernetes" {
  alias          = "gke-cluster"
  config_path    = "~/.kube/config"
  config_context = var.GKE_CLUSTER_CONTEXT
}

provider "helm" {
  alias = "gke-cluster"
  kubernetes {
    config_path    = "~/.kube/config"
    config_context = var.GKE_CLUSTER_CONTEXT
  }
}

module "secret-manager" {
  source     = "GoogleCloudPlatform/secret-manager/google"
  version    = "~> 0.8"
  project_id = var.GCP_PROJECT_ID
}

data "terraform_remote_state" "metrics" {
  backend = "gcs"
  config = {
    bucket = "aztec-terraform"
    prefix = "metrics-deploy/us-west1-a/aztec-gke-private/${var.METRICS_NAMESPACE}/terraform.tfstate"
  }
}

data "terraform_remote_state" "blockchain_node_engine" {
  backend = "gcs"
  config = {
    bucket = "aztec-terraform"
    prefix = "terraform/state/blockchain-node-engine"
  }
}

data "google_secret_manager_secret_version" "mnemonic_latest" {
  secret = "${var.RELEASE_PREFIX}-mnemonic"
}

data "google_secret_manager_secret_version" "blockchain_node_api_key_latest" {
  secret = "alpha-testnet-geth-api-key"
}

data "google_secret_manager_secret_version" "quicknode_sepolia_rpc" {
  secret = "quicknode-url"
}

data "kubernetes_service" "reth" {
  provider = kubernetes.gke-cluster
  metadata {
    name      = "reth"
    namespace = "reth"
  }
}

data "kubernetes_service" "lighthouse" {
  provider = kubernetes.gke-cluster
  metadata {
    name      = "lighthouse"
    namespace = "reth"
  }
}

locals {
  ethereum_hosts = [
    "http://${data.kubernetes_service.reth.metadata.0.name}.${data.kubernetes_service.reth.metadata.0.namespace}.svc.cluster.local:8545",
    "https://${data.terraform_remote_state.blockchain_node_engine.outputs.sepolia_node_rpc_api_url}?key=${
      data.google_secret_manager_secret_version.blockchain_node_api_key_latest.secret_data
    }",
    data.google_secret_manager_secret_version.quicknode_sepolia_rpc.secret_data
  ]

  consensus_hosts = [
    "https://${data.terraform_remote_state.blockchain_node_engine.outputs.sepolia_node_beacon_api_url}",
    "http://${data.kubernetes_service.lighthouse.metadata.0.name}.${data.kubernetes_service.lighthouse.metadata.0.namespace}.svc.cluster.local:5052",
    data.google_secret_manager_secret_version.quicknode_sepolia_rpc.secret_data
  ]

  consensus_api_keys = [
    data.google_secret_manager_secret_version.blockchain_node_api_key_latest.secret_data
  ]

  consensus_api_key_headers = [
    "X-goog-api-key"
  ]
}

resource "helm_release" "validators" {
  provider         = helm.gke-cluster
  name             = "${var.RELEASE_PREFIX}-validator"
  repository       = "../../"
  chart            = "aztec-validator"
  namespace        = var.NAMESPACE
  create_namespace = true
  upgrade_install  = true

  values = [
    file("./values/${var.VALIDATOR_VALUES}"),
  ]

  set {
    name  = "global.aztecImage.repository"
    value = split(":", var.AZTEC_DOCKER_IMAGE)[0] # e.g. aztecprotocol/aztec
  }

  set {
    name  = "global.aztecImage.tag"
    value = split(":", var.AZTEC_DOCKER_IMAGE)[1] # e.g. latest
  }

  set {
    name  = "global.otelCollectorEndpoint"
    value = "http://${data.terraform_remote_state.metrics.outputs.otel_collector_ip}:4318"
  }

  set {
    name  = "global.useGcloudLogging"
    value = true
  }

  set_list {
    name  = "global.l1ExecutionUrls"
    value = local.ethereum_hosts
  }

  set_list {
    name  = "global.l1ConsensusUrls"
    value = local.consensus_hosts
  }

  set_list {
    name  = "global.l1ConsensusHostApiKeys"
    value = local.consensus_api_keys
  }

  set_list {
    name  = "global.l1ConsensusHostApiKeyHeaders"
    value = local.consensus_api_key_headers
  }

  set {
    name  = "validator.mnemonic"
    value = data.google_secret_manager_secret_version.mnemonic_latest.secret_data
  }

  timeout       = 300
  wait          = false
  wait_for_jobs = false
}

resource "helm_release" "prover" {
  provider         = helm.gke-cluster
  name             = "${var.RELEASE_PREFIX}-prover"
  repository       = "../../"
  chart            = "aztec-prover-stack"
  namespace        = var.NAMESPACE
  create_namespace = true
  upgrade_install  = true

  values = [
    file("./values/${var.PROVER_VALUES}"),
  ]

  set {
    name  = "node.node.env.NODE_HOSTS"
    value = "${var.RELEASE_PREFIX}-validator-headless.${var.NAMESPACE}.svc.cluster.local"
  }

  set {
    name  = "global.aztecImage.repository"
    value = split(":", var.AZTEC_DOCKER_IMAGE)[0] # e.g. aztecprotocol/aztec
  }

  set {
    name  = "global.aztecImage.tag"
    value = split(":", var.AZTEC_DOCKER_IMAGE)[1] # e.g. latest
  }

  set {
    name  = "global.otelCollectorEndpoint"
    value = "http://${data.terraform_remote_state.metrics.outputs.otel_collector_ip}:4318"
  }

  set {
    name  = "global.useGcloudLogging"
    value = true
  }

  set_list {
    name  = "global.l1ExecutionUrls"
    value = local.ethereum_hosts
  }

  set_list {
    name  = "global.l1ConsensusUrls"
    value = local.consensus_hosts
  }

  set_list {
    name  = "global.l1ConsensusHostApiKeys"
    value = local.consensus_api_keys
  }

  set_list {
    name  = "global.l1ConsensusHostApiKeyHeaders"
    value = local.consensus_api_key_headers
  }

  set {
    name  = "node.mnemonic"
    value = data.google_secret_manager_secret_version.mnemonic_latest.secret_data
  }

  timeout       = 300
  wait          = false
  wait_for_jobs = false
}

resource "kubernetes_manifest" "rpc_ingress_certificate" {
  provider = kubernetes.gke-cluster

  manifest = {
    "apiVersion" = "networking.gke.io/v1"
    "kind"       = "ManagedCertificate"
    "metadata" = {
      "name"      = "${var.RELEASE_PREFIX}-rpc-ingress-certificate"
      "namespace" = var.NAMESPACE
    }
    "spec" = {
      "domains" = [
        var.RPC_HOSTNAME
      ]
    }
  }
}

resource "kubernetes_manifest" "rpc_ingress_backend" {
  provider = kubernetes.gke-cluster
  manifest = {
    "apiVersion" = "cloud.google.com/v1"
    "kind"       = "BackendConfig"
    "metadata" = {
      "name"      = "${var.RELEASE_PREFIX}-rpc-ingress-backend"
      "namespace" = var.NAMESPACE
    }
    "spec" = {
      "sessionAffinity" = {
        "affinityType"         = "CLIENT_IP"
        "affinityCookieTtlSec" = 10
      }
      "healthCheck" = {
        "checkIntervalSec" = 15
        "timeoutSec"       = 5
        "type"             = "HTTP"
        "port"             = 8080
        "requestPath"      = "/status"
      }
    }
  }
}

resource "google_compute_global_address" "rpc_ingress_ip" {
  provider     = google
  name         = "${var.RELEASE_PREFIX}-rpc-ingress"
  address_type = "EXTERNAL"

  lifecycle {
    prevent_destroy = true
  }
}

resource "helm_release" "rpc" {
  provider         = helm.gke-cluster
  name             = "${var.RELEASE_PREFIX}-rpc"
  repository       = "../../"
  chart            = "aztec-node"
  namespace        = var.NAMESPACE
  create_namespace = true
  upgrade_install  = true

  values = [
    file("./values/${var.NODE_RPC_VALUES}"),

    # a `set` block interferes with json encoding. Use a tmp values block
    yamlencode({
      service = {
        rpc = {
          annotations = {
            "cloud.google.com/backend-config" = jsonencode({
              "default" = "${var.RELEASE_PREFIX}-rpc-ingress-backend"
            })
          }
        }
      }
      ingress = {
        rpc = {
          host = var.RPC_HOSTNAME
          annotations = {
            "kubernetes.io/ingress.class"                 = "gce"
            "kubernetes.io/ingress.global-static-ip-name" = "${var.RELEASE_PREFIX}-rpc-ingress"
            "networking.gke.io/managed-certificates"      = "${var.RELEASE_PREFIX}-rpc-ingress-certificate"
          }
        }
      }
    })
  ]

  set {
    name  = "global.aztecImage.repository"
    value = split(":", var.AZTEC_DOCKER_IMAGE)[0] # e.g. aztecprotocol/aztec
  }

  set {
    name  = "global.aztecImage.tag"
    value = split(":", var.AZTEC_DOCKER_IMAGE)[1] # e.g. latest
  }

  set {
    name  = "global.otelCollectorEndpoint"
    value = "http://${data.terraform_remote_state.metrics.outputs.otel_collector_ip}:4318"
  }

  set {
    name  = "global.useGcloudLogging"
    value = true
  }

  set_list {
    name  = "global.l1ExecutionUrls"
    value = local.ethereum_hosts
  }

  set_list {
    name  = "global.l1ConsensusUrls"
    value = local.consensus_hosts
  }

  set_list {
    name  = "global.l1ConsensusHostApiKeys"
    value = local.consensus_api_keys
  }

  set_list {
    name  = "global.l1ConsensusHostApiKeyHeaders"
    value = local.consensus_api_key_headers
  }

  timeout       = 300
  wait          = false
  wait_for_jobs = false
}

resource "helm_release" "archive_node" {
  provider         = helm.gke-cluster
  name             = "${var.RELEASE_PREFIX}-archive"
  repository       = "../../"
  chart            = "aztec-node"
  namespace        = var.NAMESPACE
  create_namespace = true
  upgrade_install  = true

  values = [
    file("./values/${var.ARCHIVE_NODE_VALUES}"),
  ]

  set {
    name  = "global.aztecImage.repository"
    value = split(":", var.AZTEC_DOCKER_IMAGE)[0] # e.g. aztecprotocol/aztec
  }

  set {
    name  = "global.aztecImage.tag"
    value = split(":", var.AZTEC_DOCKER_IMAGE)[1] # e.g. latest
  }

  set {
    name  = "global.otelCollectorEndpoint"
    value = "http://${data.terraform_remote_state.metrics.outputs.otel_collector_ip}:4318"
  }

  set {
    name  = "global.useGcloudLogging"
    value = true
  }

  set_list {
    name  = "global.l1ExecutionUrls"
    value = local.ethereum_hosts
  }

  set_list {
    name  = "global.l1ConsensusUrls"
    value = local.consensus_hosts
  }

  set_list {
    name  = "global.l1ConsensusHostApiKeys"
    value = local.consensus_api_keys
  }

  set_list {
    name  = "global.l1ConsensusHostApiKeyHeaders"
    value = local.consensus_api_key_headers
  }

  timeout       = 300
  wait          = false
  wait_for_jobs = false
}

resource "helm_release" "bot" {
  provider         = helm.gke-cluster
  name             = "${var.RELEASE_PREFIX}-bot"
  repository       = "../../"
  chart            = "aztec-bot"
  namespace        = var.NAMESPACE
  create_namespace = true
  upgrade_install  = true

  values = [
    file("./values/${var.BOT_VALUES}"),
  ]

  set {
    name  = "global.aztecImage.repository"
    value = split(":", var.AZTEC_DOCKER_IMAGE)[0] # e.g. aztecprotocol/aztec
  }

  set {
    name  = "global.aztecImage.tag"
    value = split(":", var.AZTEC_DOCKER_IMAGE)[1] # e.g. latest
  }

  set {
    name  = "global.otelCollectorEndpoint"
    value = "http://${data.terraform_remote_state.metrics.outputs.otel_collector_ip}:4318"
  }

  set {
    name  = "global.useGcloudLogging"
    value = true
  }

  set {
    name  = "bot.nodeUrl"
    value = "https://${var.RPC_HOSTNAME}"
  }

  set_list {
    name  = "global.l1ExecutionUrls"
    value = local.ethereum_hosts
  }

  set {
    name  = "bot.mnemonic"
    value = data.google_secret_manager_secret_version.mnemonic_latest.secret_data
  }

  timeout       = 300
  wait          = false
  wait_for_jobs = false
}

data "kubernetes_service" "rpc_admin_svc" {
  depends_on = [helm_release.rpc]
  provider   = kubernetes.gke-cluster
  metadata {
    name      = "${var.RELEASE_PREFIX}-rpc-node-admin"
    namespace = var.NAMESPACE
  }
}

resource "helm_release" "snapshots" {
  provider         = helm.gke-cluster
  name             = "${var.RELEASE_PREFIX}-snapshots"
  repository       = "../../"
  chart            = "aztec-snapshots"
  namespace        = var.NAMESPACE
  create_namespace = true
  upgrade_install  = true

  values = [
    file("./values/${var.SNAPSHOT_VALUES}"),
  ]

  set {
    name  = "snapshots.aztecNodeAdminUrl"
    value = "http://${data.kubernetes_service.rpc_admin_svc.metadata.0.name}.${data.kubernetes_service.rpc_admin_svc.metadata.0.namespace}.svc.cluster.local:8880"
  }

  timeout       = 300
  wait          = false
  wait_for_jobs = false
}

# temporary node to debug memory usage
resource "helm_release" "no_p2p_node" {
  provider         = helm.gke-cluster
  name             = "${var.RELEASE_PREFIX}-no-p2p"
  repository       = "../../"
  chart            = "aztec-node"
  namespace        = var.NAMESPACE
  create_namespace = true
  upgrade_install  = true

  values = [
    file("./values/testnet-no-p2p-node.yaml"),
  ]

  set {
    name  = "global.aztecImage.repository"
    value = split(":", var.AZTEC_DOCKER_IMAGE)[0] # e.g. aztecprotocol/aztec
  }

  set {
    name  = "global.aztecImage.tag"
    value = split(":", var.AZTEC_DOCKER_IMAGE)[1] # e.g. latest
  }

  set {
    name  = "global.otelCollectorEndpoint"
    value = "http://${data.terraform_remote_state.metrics.outputs.otel_collector_ip}:4318"
  }

  set {
    name  = "global.useGcloudLogging"
    value = true
  }

  set_list {
    name  = "global.l1ExecutionUrls"
    value = local.ethereum_hosts
  }

  set_list {
    name  = "global.l1ConsensusUrls"
    value = local.consensus_hosts
  }

  set_list {
    name  = "global.l1ConsensusHostApiKeys"
    value = local.consensus_api_keys
  }

  set_list {
    name  = "global.l1ConsensusHostApiKeyHeaders"
    value = local.consensus_api_key_headers
  }

  timeout       = 300
  wait          = false
  wait_for_jobs = false
}

