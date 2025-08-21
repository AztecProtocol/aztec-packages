terraform {
  backend "gcs" {
    bucket = "aztec-terraform"
    prefix = "eth-devnet/terraform.tfstate"
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
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }
  }
}

provider "google" {
  project = var.project
  region  = var.region
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

# Get mnemonic from Google Secret Manager
data "google_secret_manager_secret_version" "mnemonic_latest" {
  secret = var.MNEMONIC_SECRET_NAME
}

# Static IP addresses for eth-devnet services
resource "google_compute_address" "eth_execution_ip" {
  count        = var.CREATE_STATIC_IPS ? 1 : 0
  provider     = google
  name         = "${var.RELEASE_PREFIX}-execution-ip"
  address_type = "EXTERNAL"
  region       = var.region

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_compute_address" "eth_beacon_ip" {
  count        = var.CREATE_STATIC_IPS ? 1 : 0
  provider     = google
  name         = "${var.RELEASE_PREFIX}-beacon-ip"
  address_type = "EXTERNAL"
  region       = var.region

  lifecycle {
    prevent_destroy = true
  }
}

# Generate genesis files before deploying
resource "null_resource" "generate_genesis" {
  triggers = {
    chain_id   = var.CHAIN_ID
    block_time = var.BLOCK_TIME
    gas_limit  = var.GAS_LIMIT
    mnemonic   = data.google_secret_manager_secret_version.mnemonic_latest.secret_data
  }

  provisioner "local-exec" {
    command = <<-EOT
      cd ../../eth-devnet

      # Set environment variables for genesis generation
      export CHAIN_ID=${var.CHAIN_ID}
      export BLOCK_TIME=${var.BLOCK_TIME}
      export GAS_LIMIT="${var.GAS_LIMIT}"
      export MNEMONIC="${data.google_secret_manager_secret_version.mnemonic_latest.secret_data}"
      export PREFUNDED_MNEMONIC_INDICES="${var.PREFUNDED_MNEMONIC_INDICES}"

      # Use a custom directory for Foundry installation to avoid permission issues
      export FOUNDRY_DIR="$(pwd)/tmp/.foundry"

      ./create_genesis.sh
    EOT
  }

  # Clean up genesis files on destroy
  provisioner "local-exec" {
    when    = destroy
    command = <<-EOT
      cd ../../eth-devnet
      rm -rf out/ tmp/
      echo "Genesis files and Foundry installation cleaned up"
    EOT
  }
}

# Deploy eth-devnet helm chart
resource "helm_release" "eth_devnet" {
  depends_on       = [null_resource.generate_genesis]
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
    value = data.google_secret_manager_secret_version.mnemonic_latest.secret_data
  }


  dynamic "set" {
    for_each = var.CREATE_STATIC_IPS ? [1] : []
    content {
      name  = "ethereum.execution.service.loadBalancerIP"
      value = google_compute_address.eth_execution_ip[0].address
    }
  }

  dynamic "set" {
    for_each = var.CREATE_STATIC_IPS ? [1] : []
    content {
      name  = "ethereum.beacon.service.loadBalancerIP"
      value = google_compute_address.eth_beacon_ip[0].address
    }
  }

  timeout       = 300
  wait          = true
  wait_for_jobs = false
}

