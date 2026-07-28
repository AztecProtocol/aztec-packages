terraform {
  backend "gcs" {
    bucket = "aztec-terraform"
    prefix = "aztec-gke-public/mainnet-rpc/deploy-rpc/terraform.tfstate"
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
    l1_rpc_secret_name                            = "mainnet-rpc-urls"
    l1_consensus_host_urls_secret_name            = "mainnet-consensus-host-urls"
    l1_consensus_host_api_keys_secret_name        = "mainnet-consensus-host-api-keys"
    l1_consensus_host_api_key_headers_secret_name = "mainnet-consensus-host-api-key-headers"
  }

  env = {
    NETWORK           = "mainnet"
    L1_CHAIN_ID       = "1"
    RPC_MAX_BODY_SIZE = "10mb"
  }

  rpcs = {
    canonical = merge(local.l1_secret_names, {
      aztec_docker_image = var.CANONICAL_AZTEC_DOCKER_IMAGE
      hosts              = ["v5.mainnet.rpc.aztec-labs.com", "canonical.mainnet.rpc.aztec-labs.com"]
      storage_size       = "8Gi"
      env = merge(local.env, {
        ROLLUP_VERSION = ""
      })
    })
    v4 = merge(local.l1_secret_names, {
      aztec_docker_image = var.V4_AZTEC_DOCKER_IMAGE
      hosts              = ["v4.mainnet.rpc.aztec-labs.com"]
      storage_size       = "8Gi"
      env = merge(local.env, {
        ROLLUP_VERSION = "2934756905"
      })
    })
  }

  consumer_secret_names = [
    "mainnet-rpc-consumer-client1",
    "mainnet-rpc-consumer-client2",
    "mainnet-rpc-consumer-client3",
    "mainnet-rpc-consumer-client4",
    "mainnet-rpc-consumer-client5",
    "mainnet-rpc-consumer-client6",
    "mainnet-rpc-consumer-client7",
    "mainnet-rpc-consumer-client8",
    "mainnet-rpc-consumer-client9",
    "mainnet-rpc-consumer-client10",
    "mainnet-rpc-consumer-client11",
    "mainnet-rpc-consumer-client12"
  ]

  consumers = {
    for name in local.consumer_secret_names : name => {
      username                       = name
      gcp_secret_manager_secret_name = name
      rate_limit_minute              = 0
    }
  }
}

module "environment" {
  source = "../../modules/environment"

  providers = {
    helm       = helm.gke-cluster
    kubernetes = kubernetes.gke-cluster
    google     = google
  }

  NAMESPACE       = "mainnet-rpc"
  RELEASE_PREFIX  = "mainnet"
  RPCS            = local.rpcs
  ALLOW_ANONYMOUS = false
  CONSUMERS = local.consumers
  IRM_METRICS_ENABLED = true
}
