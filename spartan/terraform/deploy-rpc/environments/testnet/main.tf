terraform {
  backend "gcs" {
    bucket = "aztec-terraform"
    prefix = "aztec-gke-public/testnet-rpc/deploy-rpc/terraform.tfstate"
  }

  required_providers {
    helm = {
      source  = "hashicorp/helm"
      version = "~> 3.1.2"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 3.1.0"
    }
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
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
  kubernetes = {
    config_path    = "~/.kube/config"
    config_context = var.K8S_CLUSTER_CONTEXT
  }
}

provider "google" {
  project = var.GCP_PROJECT_ID
  region  = var.GCP_REGION
}

locals {
  l1_secret_names = {
    l1_rpc_secret_name                            = "sepolia-rpc-urls"
    l1_consensus_host_urls_secret_name            = "sepolia-consensus-host-urls"
    l1_consensus_host_api_keys_secret_name        = "sepolia-consensus-host-api-keys"
    l1_consensus_host_api_key_headers_secret_name = "sepolia-consensus-host-api-key-headers"
  }

  env = {
    NETWORK           = "testnet"
    L1_CHAIN_ID       = "11155111"
    RPC_MAX_BODY_SIZE = "10mb"
  }

  rpcs = {
    # TODO enable canonical RPC once testnet upgrades
    # canonical = merge(local.l1_secret_names, {
    #   aztec_docker_image = var.CANONICAL_AZTEC_DOCKER_IMAGE
    #   hosts              = ["testnet-new.rpc.aztec-labs.com"]
    #   storage_size       = "8Gi"
    #   env = merge(local.env, {
    #     ROLLUP_VERSION = ""
    #   })
    # })
    v4 = merge(local.l1_secret_names, {
      aztec_docker_image = var.V4_AZTEC_DOCKER_IMAGE
      hosts              = ["v4.testnet.rpc.aztec-labs.com"]
      storage_size       = "8Gi"
      env = merge(local.env, {
        ROLLUP_VERSION = "4127419662"
      })
    })
  }
}

module "environment" {
  source = "../../modules/environment"

  providers = {
    helm       = helm.gke-cluster
    kubernetes = kubernetes.gke-cluster
    google     = google
  }

  NAMESPACE       = "testnet-rpc"
  RELEASE_PREFIX  = "testnet"
  RPCS            = local.rpcs
  ALLOW_ANONYMOUS = true

  IRM_METRICS_ENABLED = false
}
