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


data "terraform_remote_state" "metrics" {
  backend = "gcs"
  config = {
    bucket = "aztec-terraform"
    prefix = "metrics-deploy/us-west1-a/aztec-gke-private/${var.METRICS_NAMESPACE}/terraform.tfstate"
  }
}

resource "google_compute_address" "bootnode_ip" {
  for_each     = var.EXPOSE_HTTPS_BOOTNODE == true ? toset(["${var.RELEASE_NAME}-bootnode-ip"]) : toset([])
  provider     = google
  name         = each.key
  address_type = "EXTERNAL"
  region       = var.BOOTNODE_IP_REGION
}

# Aztec Helm release for gke-cluster
resource "helm_release" "aztec-gke-cluster" {
  provider         = helm.gke-cluster
  name             = var.RELEASE_NAME
  repository       = "../../"
  chart            = "aztec-network"
  namespace        = var.RELEASE_NAME
  create_namespace = true
  upgrade_install  = true

  # base values and resources file - defaults to gcloud.yaml
  values = [
    file("../../aztec-network/resources/${var.RESOURCES_FILE}"),
    file("../../aztec-network/values/${var.VALUES_FILE}")
  ]

  set {
    name  = "images.aztec.image"
    value = var.AZTEC_DOCKER_IMAGE
  }

  dynamic "set" {
    for_each = var.L1_DEPLOYMENT_MNEMONIC != "" ? toset(["iterate"]) : toset([])
    content {
      name  = "aztec.l1DeploymentMnemonic"
      value = var.L1_DEPLOYMENT_MNEMONIC
    }
  }

  dynamic "set" {
    for_each = var.L1_DEPLOYMENT_PRIVATE_KEY != "" ? toset(["iterate"]) : toset([])
    content {
      name  = "ethereum.deployL1ContractsPrivateKey"
      value = var.L1_DEPLOYMENT_PRIVATE_KEY
    }
  }

  dynamic "set" {
    for_each = var.EXTERNAL_ETHEREUM_HOSTS != "" ? toset(["iterate"]) : toset([])
    content {
      name  = "ethereum.execution.externalHosts"
      value = replace(var.EXTERNAL_ETHEREUM_HOSTS, ",", "\\,")
      type  = "string"
    }
  }

  dynamic "set" {
    for_each = var.EXTERNAL_ETHEREUM_CONSENSUS_HOST != "" ? toset(["iterate"]) : toset([])
    content {
      name  = "ethereum.beacon.externalHost"
      value = var.EXTERNAL_ETHEREUM_CONSENSUS_HOST
    }
  }

  dynamic "set" {
    for_each = var.EXTERNAL_ETHEREUM_CONSENSUS_HOST_API_KEY != "" ? toset(["iterate"]) : toset([])
    content {
      name  = "ethereum.beacon.apiKey"
      value = var.EXTERNAL_ETHEREUM_CONSENSUS_HOST_API_KEY
    }
  }

  dynamic "set" {
    for_each = var.EXTERNAL_ETHEREUM_CONSENSUS_HOST_API_KEY_HEADER != "" ? toset(["iterate"]) : toset([])
    content {
      name  = "ethereum.beacon.apiKeyHeader"
      value = var.EXTERNAL_ETHEREUM_CONSENSUS_HOST_API_KEY_HEADER
    }
  }

  dynamic "set" {
    for_each = var.EXPOSE_HTTPS_BOOTNODE == true ? toset(["iterate"]) : toset([])
    content {
      name  = "bootNode.fixedExternalIP"
      value = google_compute_address.bootnode_ip["${var.RELEASE_NAME}-bootnode-ip"].address
    }
  }

  set {
    name  = "aztec.l1Salt"
    value = var.L1_DEPLOYMENT_SALT
  }

  set {
    name  = "telemetry.otelCollectorEndpoint"
    value = "http://${data.terraform_remote_state.metrics.outputs.otel_collector_ip}:4318"
  }

  set {
    name  = "network.gke"
    value = true
  }

  # Setting timeout and wait conditions
  timeout       = 1200 # 20 minutes in seconds
  wait          = true
  wait_for_jobs = true

}
