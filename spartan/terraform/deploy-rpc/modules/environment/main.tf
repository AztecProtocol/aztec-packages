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
  irm_alloy_name              = "${var.RELEASE_PREFIX}-rpc-irm-alloy"
  irm_metric_catalog          = yamldecode(file("${path.module}/../../../../metrics/irm-rpc-gateway.yaml"))
  rpc_gateway_metrics_enabled = var.OTEL_COLLECTOR_ENDPOINT_GCP_SECRET_NAME != "" || var.IRM_METRICS_ENABLED

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
  LOG_LEVEL                                     = each.value.log_level
  ENV                                           = each.value.env
  L1_RPC_SECRET_NAME                            = each.value.l1_rpc_secret_name
  L1_CONSENSUS_HOST_URLS_SECRET_NAME            = each.value.l1_consensus_host_urls_secret_name
  L1_CONSENSUS_HOST_API_KEYS_SECRET_NAME        = each.value.l1_consensus_host_api_keys_secret_name
  L1_CONSENSUS_HOST_API_KEY_HEADERS_SECRET_NAME = each.value.l1_consensus_host_api_key_headers_secret_name
  STORAGE_SIZE                                  = each.value.storage_size
  EXTRA_HELM_VALUES                             = each.value.extra_helm_values
  MIN_REPLICAS                                  = each.value.min_replicas
  FORCE_UPDATE                                  = each.value.force_update
  RECREATE_PODS                                 = each.value.recreate_pods
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

  KONG_TRUSTED_IP_RANGES = ["35.191.0.0/16", "130.211.0.0/22"] # Google LB IP ranges https://docs.cloud.google.com/load-balancing/docs/firewall-rules

  ROUTES                       = local.rpc_routes
  CONSUMERS                    = var.CONSUMERS
  KONG_METRICS_SERVICE_ENABLED = local.rpc_gateway_metrics_enabled

  depends_on = [module.rpc]
}

module "rpc_gateway_metrics_collector" {
  count = var.OTEL_COLLECTOR_ENDPOINT_GCP_SECRET_NAME != "" ? 1 : 0

  source = "../../../modules/otel-metrics-collector"

  providers = {
    helm       = helm
    kubernetes = kubernetes
  }

  NAMESPACE                               = var.NAMESPACE
  RELEASE_NAME                            = "${var.RELEASE_PREFIX}-rpc-kong-otel-collector"
  OTEL_COLLECTOR_ENDPOINT_GCP_SECRET_NAME = var.OTEL_COLLECTOR_ENDPOINT_GCP_SECRET_NAME
  SCRAPE_CONFIGS = [
    {
      job_name        = "kong"
      scrape_interval = "15s"
      metrics_path    = "/metrics"
      targets         = ["${module.rpc_gateway.metrics_service_name}.${module.rpc_gateway.metrics_service_namespace}.svc.cluster.local:${module.rpc_gateway.metrics_service_port}"]
      labels = {
        component = "kong"
        network   = var.RELEASE_PREFIX
      }
    }
  ]
  RESOURCE_ATTRIBUTES = {
    "service.name"    = "${var.RELEASE_PREFIX}-rpc-kong"
    "network"         = var.RELEASE_PREFIX
    "aztec.component" = "kong"
  }
  IRM_CONFIG = var.IRM_METRICS_ENABLED ? {
    alloy_release_name = local.irm_alloy_name
    job_name           = "rpc-kong"
    grafana_cloud = {
      secret_name      = var.IRM_GRAFANA_CLOUD_SECRET_NAME
      remote_write_url = var.IRM_GRAFANA_CLOUD_REMOTE_WRITE_URL
      username         = var.IRM_GRAFANA_CLOUD_USERNAME
    }
    resource_attributes = {
      rpc_namespace = var.NAMESPACE
    }
    metric_catalog  = local.irm_metric_catalog
    alloy_resources = var.IRM_ALLOY_RESOURCES
  } : null
  EXTERNAL_SECRET_STORE_NAME       = var.EXTERNAL_SECRET_STORE_NAME
  EXTERNAL_SECRET_STORE_KIND       = var.EXTERNAL_SECRET_STORE_KIND
  EXTERNAL_SECRET_REFRESH_INTERVAL = var.EXTERNAL_SECRET_REFRESH_INTERVAL

  depends_on = [module.rpc_gateway]
}

moved {
  from = kubernetes_manifest.irm_grafana_cloud_secret[0]
  to   = module.rpc_gateway_metrics_collector[0].kubernetes_manifest.irm_grafana_cloud_secret[0]
}

moved {
  from = helm_release.irm_alloy[0]
  to   = module.rpc_gateway_metrics_collector[0].helm_release.irm_alloy[0]
}
