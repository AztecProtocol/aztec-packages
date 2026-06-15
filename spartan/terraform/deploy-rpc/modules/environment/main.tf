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

  irm_alloy_name      = "${var.RELEASE_PREFIX}-rpc-irm-alloy"
  irm_secret_name     = "${local.irm_alloy_name}-grafana-cloud"
  irm_metric_regex    = "up|kong_http_requests_total|kong_request_latency_ms_bucket|kong_latency_bucket|kong_upstream_target_health"
  irm_labelkeep_regex = "__name__|network|rpc_namespace|k8s_namespace_name|job|route|code|le|type|state|upstream|target"
  irm_extra_labels = {
    "app.kubernetes.io/component" = "metrics"
  }

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

resource "kubernetes_manifest" "irm_grafana_cloud_secret" {
  count = var.IRM_METRICS_ENABLED ? 1 : 0

  manifest = {
    apiVersion = "external-secrets.io/v1"
    kind       = "ExternalSecret"
    metadata = {
      name      = local.irm_secret_name
      namespace = var.NAMESPACE
    }
    spec = {
      refreshInterval = "1m"
      secretStoreRef = {
        name = "gcp-secret-store"
        kind = "ClusterSecretStore"
      }
      target = {
        name           = local.irm_secret_name
        creationPolicy = "Owner"
        template = {
          engineVersion = "v2"
          type          = "Opaque"
          data = {
            "grafana-cloud-password" = "{{ .password }}"
          }
        }
      }
      data = [
        {
          secretKey = "password"
          remoteRef = {
            key = var.IRM_GRAFANA_CLOUD_SECRET_NAME
          }
        }
      ]
    }
  }

  wait {
    condition {
      type   = "Ready"
      status = "True"
    }
  }

  depends_on = [kubernetes_namespace_v1.rpc]
}

resource "helm_release" "irm_alloy" {
  count = var.IRM_METRICS_ENABLED ? 1 : 0

  name             = local.irm_alloy_name
  chart            = "${path.module}/alloy-1.10.0.tgz"
  namespace        = var.NAMESPACE
  create_namespace = false
  wait             = true
  timeout          = 600

  values = [yamlencode({
    fullnameOverride = local.irm_alloy_name

    crds = {
      create = false
    }

    alloy = {
      configMap = {
        create = true
        content = templatefile("${path.module}/templates/rpc-irm-alloy.config.alloy.tftpl", {
          labelkeep_regex         = local.irm_labelkeep_regex
          metric_regex            = local.irm_metric_regex
          metrics_service_address = "${module.rpc_gateway.metrics_service_name}.${module.rpc_gateway.metrics_service_namespace}.svc.cluster.local:${module.rpc_gateway.metrics_service_port}"
          namespace               = var.NAMESPACE
          network                 = var.RELEASE_PREFIX
          remote_write_url        = var.IRM_GRAFANA_CLOUD_REMOTE_WRITE_URL
          remote_write_username   = var.IRM_GRAFANA_CLOUD_USERNAME
          scrape_interval         = var.IRM_ALLOY_SCRAPE_INTERVAL
        })
      }
      mounts = {
        extra = [
          {
            name      = "alloy-secret"
            mountPath = "/etc/alloy/secret"
            readOnly  = true
          }
        ]
      }
      resources = var.IRM_ALLOY_RESOURCES
    }

    controller = {
      type        = "deployment"
      replicas    = 1
      extraLabels = local.irm_extra_labels
      podLabels   = local.irm_extra_labels
      volumes = {
        extra = [
          {
            name = "alloy-secret"
            secret = {
              secretName = local.irm_secret_name
            }
          }
        ]
      }
    }

    rbac = {
      create = false
    }

    service = {
      enabled = false
    }

    serviceAccount = {
      create = false
      name   = "default"
    }
  })]

  depends_on = [
    kubernetes_manifest.irm_grafana_cloud_secret,
    module.rpc_gateway,
  ]
}
