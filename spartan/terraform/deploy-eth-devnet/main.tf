terraform {

  backend "local" {}
  required_providers {
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.16.1"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.24.0"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
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

# Generate genesis files before deploying
resource "null_resource" "generate_genesis" {
  triggers = {
    chain_id   = var.CHAIN_ID
    block_time = var.BLOCK_TIME
    gas_limit  = var.GAS_LIMIT
    mnemonic   = var.MNEMONIC
  }

  provisioner "local-exec" {
    command = <<-EOT
      cd ../../eth-devnet
      rm -rf out/ tmp/

      # Set environment variables for genesis generation
      export CHAIN_ID=${var.CHAIN_ID}
      export BLOCK_TIME=${var.BLOCK_TIME}
      export GAS_LIMIT="${var.GAS_LIMIT}"
      export MNEMONIC="${var.MNEMONIC}"
      export PREFUNDED_MNEMONIC_INDICES="${var.PREFUNDED_MNEMONIC_INDICES}"

      # Use a custom directory for Foundry installation to avoid permission issues
      export FOUNDRY_DIR="$HOME/.foundry"

      ./create_genesis.sh
    EOT
  }

  # Clean up genesis files on destroy
  provisioner "local-exec" {
    when    = destroy
    command = <<-EOT
      cd ../../eth-devnet
      rm -rf out/ tmp/
      echo "Genesis files cleaned up"
    EOT
  }
}

# Deploy eth-devnet helm chart
resource "helm_release" "eth_devnet" {
  depends_on       = [null_resource.generate_genesis, null_resource.cleanup_pvcs]
  provider         = helm.gke-cluster
  name             = var.RELEASE_PREFIX
  repository       = "../../"
  chart            = "eth-devnet"
  namespace        = var.NAMESPACE
  create_namespace = true
  upgrade_install  = true

  values = [
    file("./values/${var.ETH_DEVNET_VALUES}"),
    file("./values/resources-${var.RESOURCE_PROFILE}.yaml"),
  ]

  set {
    name  = "ethereum.validator.mnemonic"
    value = var.MNEMONIC
  }

  set {
    name  = "fullnameOverride"
    value = var.RELEASE_PREFIX
  }

  timeout       = 300
  wait          = true
  wait_for_jobs = false
}

data "kubernetes_service" "eth_execution" {
  provider = kubernetes.gke-cluster

  metadata {
    name      = "${var.RELEASE_PREFIX}-eth-execution"
    namespace = var.NAMESPACE
  }

  depends_on = [helm_release.eth_devnet]
}

data "kubernetes_service" "eth_beacon" {
  provider = kubernetes.gke-cluster

  metadata {
    name      = "${var.RELEASE_PREFIX}-eth-beacon"
    namespace = var.NAMESPACE
  }

  depends_on = [helm_release.eth_devnet]
}

# Cleanup PVCs created by the Helm release on destroy
resource "null_resource" "cleanup_pvcs" {
  triggers = {
    release   = var.RELEASE_PREFIX
    namespace = var.NAMESPACE
    context   = var.K8S_CLUSTER_CONTEXT
  }

  # Run during terraform destroy. We delete by Helm's standard labels to target only this release's PVCs.
  provisioner "local-exec" {
    when    = destroy
    command = <<-EOT
      set -eu
      # Delete PVCs labeled with Helm v3 standard label
      kubectl --context="${var.K8S_CLUSTER_CONTEXT}" -n "${var.NAMESPACE}" delete pvc -l "app.kubernetes.io/instance=eth-devnet" --ignore-not-found --wait=true || true
      kubectl --context="${var.K8S_CLUSTER_CONTEXT}" -n "${var.NAMESPACE}" delete configmaps -l "app.kubernetes.io/instance=eth-devnet" --ignore-not-found --wait=true || true

    EOT
  }
  # Note: helm_release depends on this null_resource so on destroy the Helm release is removed first,
  # then this cleanup runs to delete any remaining PVCs.
}
