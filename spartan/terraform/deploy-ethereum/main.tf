terraform {
  backend "gcs" {
    bucket = "aztec-terraform"
    prefix = "aztec-gke-public/ethereum/deploy-ethereum/terraform.tfstate"
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
  config_context = local.k8s_cluster_context
}

provider "helm" {
  alias = "gke-cluster"
  kubernetes = {
    config_path    = "~/.kube/config"
    config_context = local.k8s_cluster_context
  }
}

provider "google" {
  project = local.gcp_project_id
  region  = local.gcp_region
}

locals {
  gcp_project_id      = "testnet-440309"
  gcp_region          = "us-west1"
  k8s_cluster_context = "gke_testnet-440309_us-west1-a_aztec-gke-public"

  namespace           = "ethereum"
  release_prefix      = "ethereum"
  api_key_header_name = "apikey"
  storage_class_name  = "standard-rwo"
  irm_metric_catalog  = yamldecode(file("${path.module}/../../metrics/irm-ethereum.yaml"))

  ethereum_chains = {
    sepolia = {
      checkpoint_sync_url = "https://checkpoint-sync.sepolia.ethpandaops.io"
      reth_p2p_port       = 32200
      lighthouse_p2p_port = 32201
      reth_storage        = "1.5Ti"
      lighthouse_storage  = "256Gi"
      reth_resources = {
        requests = { cpu = "1", memory = "12Gi" }
        limits   = { cpu = "4", memory = "24Gi" }
      }
      lighthouse_resources = {
        requests = { cpu = "1", memory = "8Gi" }
        limits   = { cpu = "4", memory = "16Gi" }
      }
      execution_hosts       = ["json-rpc.eth-sepolia.rpc.aztec-labs.com"]
      beacon_hosts          = ["beacon.eth-sepolia.rpc.aztec-labs.com"]
      reth_extra_args       = []
      lighthouse_extra_args = []
    }
    mainnet = {
      checkpoint_sync_url = "https://mainnet.checkpoint.sigp.io"
      reth_p2p_port       = 32300
      lighthouse_p2p_port = 32301
      reth_storage        = "3.25Ti"
      lighthouse_storage  = "256Gi"
      reth_resources = {
        requests = { cpu = "1", memory = "48Gi" }
        limits   = { cpu = "8", memory = "96Gi" }
      }
      lighthouse_resources = {
        requests = { cpu = "1", memory = "12Gi" }
        limits   = { cpu = "8", memory = "24Gi" }
      }
      execution_hosts       = ["json-rpc.eth-mainnet.rpc.aztec-labs.com"]
      beacon_hosts          = ["beacon.eth-mainnet.rpc.aztec-labs.com"]
      reth_extra_args       = []
      lighthouse_extra_args = []
    }
  }

  simple_consumers = {
    for secret_name in var.API_KEY_SECRET_NAMES : secret_name => {
      username                       = secret_name
      gcp_secret_manager_secret_name = secret_name
      rate_limit_minute              = 0
    }
  }

  consumers = merge(local.simple_consumers, var.CONSUMERS)

  internal_load_balancer_addresses = merge([
    for chain in keys(local.ethereum_chains) : {
      "${chain}-reth"       = "${local.release_prefix}-${chain}-execution-internal"
      "${chain}-lighthouse" = "${local.release_prefix}-${chain}-beacon-internal"
    }
  ]...)

  gateway_routes = merge([
    for chain, node in module.ethereum_nodes : {
      "${chain}-execution" = {
        hosts                       = local.ethereum_chains[chain].execution_hosts
        route_namespace             = local.namespace
        upstream_service_name       = node.reth_service_name
        upstream_service_port       = node.reth_http_port
        auth_mode                   = "keyed_only"
        anonymous_rate_limit_minute = 0
        path                        = "/"
        path_type                   = "Prefix"
        strip_path                  = false
      }
      "${chain}-beacon" = {
        hosts                       = local.ethereum_chains[chain].beacon_hosts
        route_namespace             = local.namespace
        upstream_service_name       = node.lighthouse_service_name
        upstream_service_port       = node.lighthouse_http_port
        auth_mode                   = "keyed_only"
        anonymous_rate_limit_minute = 0
        path                        = "/"
        path_type                   = "Prefix"
        strip_path                  = false
      }
    }
  ]...)
}

data "google_compute_subnetwork" "default" {
  name   = "default"
  region = local.gcp_region
}

resource "google_compute_address" "internal_load_balancer" {
  for_each = local.internal_load_balancer_addresses

  name         = each.value
  address_type = "INTERNAL"
  region       = local.gcp_region
  subnetwork   = data.google_compute_subnetwork.default.id

  lifecycle {
    prevent_destroy = true
  }
}

resource "kubernetes_namespace_v1" "ethereum" {
  provider = kubernetes.gke-cluster

  metadata {
    name = local.namespace
  }
}

module "ethereum_nodes" {
  for_each = local.ethereum_chains

  source = "../modules/ethereum-node"

  providers = {
    helm       = helm.gke-cluster
    kubernetes = kubernetes.gke-cluster
  }

  NAMESPACE           = local.namespace
  RELEASE_PREFIX      = each.key
  CHAIN               = each.key
  CHECKPOINT_SYNC_URL = each.value.checkpoint_sync_url

  RETH_P2P_PORT      = each.value.reth_p2p_port
  RETH_STORAGE       = each.value.reth_storage
  STORAGE_CLASS_NAME = local.storage_class_name
  RETH_RESOURCES = {
    requests = {
      cpu    = each.value.reth_resources.requests.cpu
      memory = each.value.reth_resources.requests.memory
    }
    limits = {
      cpu    = each.value.reth_resources.limits.cpu
      memory = each.value.reth_resources.limits.memory
    }
  }
  RETH_EXTRA_ARGS = each.value.reth_extra_args
  RETH_INTERNAL_LOAD_BALANCER = {
    ip = google_compute_address.internal_load_balancer["${each.key}-reth"].address
  }

  LIGHTHOUSE_P2P_PORT = each.value.lighthouse_p2p_port
  LIGHTHOUSE_STORAGE  = each.value.lighthouse_storage
  LIGHTHOUSE_RESOURCES = {
    requests = {
      cpu    = each.value.lighthouse_resources.requests.cpu
      memory = each.value.lighthouse_resources.requests.memory
    }
    limits = {
      cpu    = each.value.lighthouse_resources.limits.cpu
      memory = each.value.lighthouse_resources.limits.memory
    }
  }
  LIGHTHOUSE_EXTRA_ARGS = each.value.lighthouse_extra_args
  LIGHTHOUSE_INTERNAL_LOAD_BALANCER = {
    ip = google_compute_address.internal_load_balancer["${each.key}-lighthouse"].address
  }

  depends_on = [kubernetes_namespace_v1.ethereum]
}

module "rpc_gateway" {
  source = "../modules/rpc-gateway"

  providers = {
    helm       = helm.gke-cluster
    kubernetes = kubernetes.gke-cluster
    google     = google
  }

  RELEASE_PREFIX     = local.release_prefix
  CONSUMER_NAMESPACE = local.namespace

  KONG_NAMESPACE                 = local.namespace
  KONG_HELM_RELEASE_NAME         = var.KONG_HELM_RELEASE_NAME
  KONG_HELM_CHART_VERSION        = var.KONG_HELM_CHART_VERSION
  KONG_INGRESS_CLASS             = var.KONG_INGRESS_CLASS
  KONG_PROXY_SERVICE_TYPE        = var.KONG_PROXY_SERVICE_TYPE
  KONG_PROXY_SERVICE_ANNOTATIONS = var.KONG_PROXY_SERVICE_ANNOTATIONS
  KONG_EXTRA_HELM_VALUES         = var.KONG_EXTRA_HELM_VALUES
  KONG_NODE_SELECTOR             = { node-type = "infra" }
  KONG_TRUSTED_IP_RANGES         = var.KONG_TRUSTED_IP_RANGES
  KONG_SERVICE_MONITOR_ENABLED   = var.KONG_SERVICE_MONITOR_ENABLED
  KONG_METRICS_SERVICE_ENABLED   = var.OTEL_COLLECTOR_ENDPOINT_GCP_SECRET_NAME != ""

  API_KEY_HEADER_NAME     = local.api_key_header_name
  ROUTES                  = local.gateway_routes
  ROUTE_RESOURCE_SUFFIX   = "l1"
  UPSTREAM_POLICY_ENABLED = false
  CONSUMERS               = local.consumers
  ENABLE_CORS             = false

  EXTERNAL_SECRET_STORE_NAME       = var.EXTERNAL_SECRET_STORE_NAME
  EXTERNAL_SECRET_STORE_KIND       = var.EXTERNAL_SECRET_STORE_KIND
  EXTERNAL_SECRET_REFRESH_INTERVAL = var.EXTERNAL_SECRET_REFRESH_INTERVAL

  CREATE_DNS                      = var.CREATE_DNS
  DNS_ZONE_NAME                   = var.DNS_ZONE_NAME
  DNS_TTL                         = var.DNS_TTL
  FRONTEND_ENABLED                = var.FRONTEND_ENABLED
  FRONTEND_STATIC_IP_ENABLED      = var.FRONTEND_STATIC_IP_ENABLED
  FRONTEND_STATIC_IP_NAME         = var.FRONTEND_STATIC_IP_NAME
  GCP_MANAGED_CERTIFICATE_ENABLED = var.GCP_MANAGED_CERTIFICATE_ENABLED

  depends_on = [module.ethereum_nodes]
}

module "ethereum_metrics_collector" {
  count = var.OTEL_COLLECTOR_ENDPOINT_GCP_SECRET_NAME != "" ? 1 : 0

  source = "../modules/otel-metrics-collector"

  providers = {
    helm       = helm.gke-cluster
    kubernetes = kubernetes.gke-cluster
  }

  NAMESPACE                               = local.namespace
  RELEASE_NAME                            = "${local.release_prefix}-metrics-collector"
  OTEL_COLLECTOR_ENDPOINT_GCP_SECRET_NAME = var.OTEL_COLLECTOR_ENDPOINT_GCP_SECRET_NAME
  NODE_SELECTOR                           = { node-type = "infra" }
  SCRAPE_CONFIGS = concat(
    [
      {
        job_name        = "ethereum-kong"
        scrape_interval = "15s"
        metrics_path    = "/metrics"
        targets         = ["${module.rpc_gateway.metrics_service_name}.${module.rpc_gateway.metrics_service_namespace}.svc.cluster.local:${module.rpc_gateway.metrics_service_port}"]
        labels = {
          component = "kong"
          network   = local.release_prefix
        }
        metric_relabel_configs = [
          {
            action        = "replace"
            source_labels = ["route"]
            regex         = "(ethereum\\.)?ethereum-(sepolia|mainnet)-(execution|beacon)-l1(\\..*)?"
            target_label  = "eth_chain"
            replacement   = "$2"
          },
          {
            action        = "replace"
            source_labels = ["route"]
            regex         = "(ethereum\\.)?ethereum-(sepolia|mainnet)-(execution|beacon)-l1(\\..*)?"
            target_label  = "eth_endpoint"
            replacement   = "$3"
          }
        ]
      }
    ],
    flatten([
      for chain, node in module.ethereum_nodes : [
        {
          job_name        = "ethereum-reth-${chain}"
          scrape_interval = "15s"
          metrics_path    = "/"
          targets         = ["${node.reth_service_name}.${node.namespace}.svc.cluster.local:9001"]
          labels = {
            component    = "ethereum-node"
            network      = local.release_prefix
            eth_chain    = chain
            eth_client   = "reth"
            eth_endpoint = "execution"
          }
        },
        {
          job_name        = "ethereum-lighthouse-${chain}"
          scrape_interval = "15s"
          metrics_path    = "/metrics"
          targets         = ["${node.lighthouse_service_name}.${node.namespace}.svc.cluster.local:5054"]
          labels = {
            component    = "ethereum-node"
            network      = local.release_prefix
            eth_chain    = chain
            eth_client   = "lighthouse"
            eth_endpoint = "beacon"
          }
        }
      ]
    ])
  )
  RESOURCE_ATTRIBUTES = {
    "network"         = local.release_prefix
    "aztec.component" = "ethereum-metrics"
  }
  IRM_CONFIG = var.IRM_METRICS_ENABLED ? {
    alloy_release_name = "${local.release_prefix}-irm-alloy"
    job_name           = "ethereum"
    grafana_cloud = {
      secret_name      = var.IRM_GRAFANA_CLOUD_SECRET_NAME
      remote_write_url = var.IRM_GRAFANA_CLOUD_REMOTE_WRITE_URL
      username         = var.IRM_GRAFANA_CLOUD_USERNAME
    }
    metric_catalog  = local.irm_metric_catalog
    alloy_resources = var.IRM_ALLOY_RESOURCES
  } : null
  EXTERNAL_SECRET_STORE_NAME       = var.EXTERNAL_SECRET_STORE_NAME
  EXTERNAL_SECRET_STORE_KIND       = var.EXTERNAL_SECRET_STORE_KIND
  EXTERNAL_SECRET_REFRESH_INTERVAL = var.EXTERNAL_SECRET_REFRESH_INTERVAL

  depends_on = [
    module.ethereum_nodes,
    module.rpc_gateway,
  ]
}
