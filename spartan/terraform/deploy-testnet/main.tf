terraform {
  backend "gcs" {
    bucket = "aztec-terraform"
    prefix = "terraform/state"
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
  project = var.GCP_PROJECT
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
  project_id = var.GCP_PROJECT
}

data "terraform_remote_state" "metrics" {
  backend = "gcs"
  config = {
    bucket = "aztec-terraform"
    prefix = "metrics-deploy/us-west1-a/aztec-gke-private/${var.METRICS_NAMESPACE}/terraform.tfstate"
  }
}

data "terraform_remote_state" "cluster" {
  backend = "gcs"
  config = {
    bucket = "aztec-terraform"
    prefix = "terraform/state/gke-cluster/terraform.tfstate"
  }
}

data "google_secret_manager_secret_version" "mnemonic_latest" {
  secret = "${var.RELEASE_PREFIX}-mnemonic"
}

data "google_secret_manager_secret_version" "blockchain_node_api_key_latest" {
  secret = "${var.RELEASE_PREFIX}-geth-api-key"
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
    "https://${data.terraform_remote_state.cluster.outputs.sepolia_node_rpc_api_url}?key=${
      data.google_secret_manager_secret_version.blockchain_node_api_key_latest.secret_data
    }"
  ]

  consensus_hosts = [
    "http://${data.kubernetes_service.lighthouse.metadata.0.name}.${data.kubernetes_service.lighthouse.metadata.0.namespace}.svc.cluster.local:5052",
    "https://${data.terraform_remote_state.cluster.outputs.sepolia_node_beacon_api_url}"
  ]

  consensus_api_keys = [
    "",
    data.google_secret_manager_secret_version.blockchain_node_api_key_latest.secret_data
  ]

  consensus_api_key_headers = [
    "",
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

resource "helm_release" "nodes" {
  provider         = helm.gke-cluster
  name             = "${var.RELEASE_PREFIX}-node"
  repository       = "../../"
  chart            = "aztec-node"
  namespace        = var.NAMESPACE
  create_namespace = true
  upgrade_install  = true

  values = [
    file("./values/${var.NODE_VALUES}"),
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

data "kubernetes_service" "node_admin_svc" {
  depends_on = [helm_release.nodes]
  provider   = kubernetes.gke-cluster
  metadata {
    name      = "${var.RELEASE_PREFIX}-node"
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
    value = "http://${data.kubernetes_service.node_admin_svc.metadata.0.name}.${data.kubernetes_service.node_admin_svc.metadata.0.namespace}.svc.cluster.local:8081"
  }

  timeout       = 300
  wait          = false
  wait_for_jobs = false
}
