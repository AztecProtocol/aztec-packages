terraform {
  required_providers {
    helm = {
      source = "hashicorp/helm"
    }
    kubernetes = {
      source = "hashicorp/kubernetes"
    }
    google = {
      source = "hashicorp/google"
    }
  }
}

locals {
  # route requests from the same client to the same RPC node in order to have a consisten view of the chain
  sticky_policy_name = "${var.RELEASE_PREFIX}-rpc-sticky-sessions"

  routed_rpcs = {
    for name, rpc in var.RPCS : name => rpc
    if length(rpc.hosts) > 0
  }

  rpc_routes = {
    for name, rpc in local.routed_rpcs : name => {
      hosts                       = rpc.hosts
      route_namespace             = var.NAMESPACE
      upstream_service_name       = module.rpc[name].service_name
      upstream_service_port       = module.rpc[name].service_port
      auth_mode                   = var.ALLOW_ANONYMOUS ? "keyed_with_anonymous" : "keyed_only"
      anonymous_rate_limit_minute = var.ANONYMOUS_RATE_LIMIT_MINUTE
    }
  }

}

resource "kubernetes_namespace_v1" "rpc" {
  metadata {
    name = var.NAMESPACE
  }
}

module "rpc" {
  for_each = var.RPCS

  source = "../rpc"

  providers = {
    helm       = helm
    kubernetes = kubernetes
  }

  NAMESPACE      = var.NAMESPACE
  RELEASE_NAME   = "${var.RELEASE_PREFIX}-rpc-${each.key}"
  RELEASE_PREFIX = var.RELEASE_PREFIX

  AZTEC_DOCKER_IMAGE                            = each.value.aztec_docker_image
  ENV                                           = each.value.env
  L1_RPC_SECRET_NAME                            = each.value.l1_rpc_secret_name
  L1_CONSENSUS_HOST_URLS_SECRET_NAME            = each.value.l1_consensus_host_urls_secret_name
  L1_CONSENSUS_HOST_API_KEYS_SECRET_NAME        = each.value.l1_consensus_host_api_keys_secret_name
  L1_CONSENSUS_HOST_API_KEY_HEADERS_SECRET_NAME = each.value.l1_consensus_host_api_key_headers_secret_name
  STORAGE_SIZE                                  = each.value.storage_size
  OTEL_COLLECTOR_ENDPOINT_GCP_SECRET_NAME       = var.OTEL_COLLECTOR_ENDPOINT_GCP_SECRET_NAME

  depends_on = [kubernetes_namespace_v1.rpc]
}

module "rpc_gateway" {
  source = "../../../modules/rpc-gateway"

  providers = {
    helm       = helm
    kubernetes = kubernetes
    google     = google
  }

  RELEASE_PREFIX     = var.RELEASE_PREFIX
  CONSUMER_NAMESPACE = var.NAMESPACE

  STICKY_SESSIONS_ENABLED    = true
  STICKY_SESSION_POLICY_NAME = local.sticky_policy_name

  ROUTES                            = local.rpc_routes
  CONSUMERS                         = var.CONSUMERS
  KONG_OTEL_METRICS_GCP_SECRET_NAME = var.OTEL_COLLECTOR_ENDPOINT_GCP_SECRET_NAME

  depends_on = [module.rpc]
}
