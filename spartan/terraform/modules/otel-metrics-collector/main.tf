terraform {
  required_providers {
    helm = {
      source = "hashicorp/helm"
    }
    kubernetes = {
      source = "hashicorp/kubernetes"
    }
  }
}

locals {
  irm_enabled       = var.IRM_CONFIG != null
  irm_alloy_name    = coalesce(try(var.IRM_CONFIG.alloy_release_name, null), "${var.RELEASE_NAME}-irm-alloy")
  irm_secret_name   = "${local.irm_alloy_name}-grafana-cloud"
  irm_otlp_endpoint = "http://${local.irm_alloy_name}.${var.NAMESPACE}.svc.cluster.local:4318"
  irm_labels = merge(var.LABELS, {
    "app.kubernetes.io/component" = "metrics"
  })
}

resource "helm_release" "collector" {
  name             = var.RELEASE_NAME
  chart            = "${path.module}/../../../charts/otel-metrics-collector"
  namespace        = var.NAMESPACE
  create_namespace = false
  upgrade_install  = true
  wait             = true
  timeout          = 300

  values = [yamlencode({
    fullnameOverride = var.RELEASE_NAME
    externalSecret = {
      gcpSecretName   = var.OTEL_COLLECTOR_ENDPOINT_GCP_SECRET_NAME
      refreshInterval = var.EXTERNAL_SECRET_REFRESH_INTERVAL
      secretStore = {
        name = var.EXTERNAL_SECRET_STORE_NAME
        kind = var.EXTERNAL_SECRET_STORE_KIND
      }
    }
    scrapeConfigs      = var.SCRAPE_CONFIGS
    resourceAttributes = var.RESOURCE_ATTRIBUTES
    irm = {
      enabled            = local.irm_enabled
      endpoint           = local.irm_otlp_endpoint
      resourceAttributes = try(var.IRM_CONFIG.resource_attributes, {})
      metricCatalog = try(var.IRM_CONFIG.metric_catalog, {
        schemaVersion      = 1
        resourceAttributes = []
        metrics            = []
      })
    }
    labels       = var.LABELS
    image        = var.IMAGE
    replicas     = var.REPLICAS
    nodeSelector = var.NODE_SELECTOR
    resources    = var.RESOURCES
  })]

  depends_on = [helm_release.irm_alloy]
}

resource "kubernetes_manifest" "irm_grafana_cloud_secret" {
  count = local.irm_enabled ? 1 : 0

  manifest = {
    apiVersion = "external-secrets.io/v1"
    kind       = "ExternalSecret"
    metadata = {
      name      = local.irm_secret_name
      namespace = var.NAMESPACE
    }
    spec = {
      refreshInterval = var.EXTERNAL_SECRET_REFRESH_INTERVAL
      secretStoreRef = {
        name = var.EXTERNAL_SECRET_STORE_NAME
        kind = var.EXTERNAL_SECRET_STORE_KIND
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
            key = try(var.IRM_CONFIG.grafana_cloud.secret_name, "")
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
}

resource "helm_release" "irm_alloy" {
  count = local.irm_enabled ? 1 : 0

  name             = local.irm_alloy_name
  chart            = "${path.module}/alloy-1.10.0.tgz"
  namespace        = var.NAMESPACE
  create_namespace = false
  upgrade_install  = true
  wait             = true
  timeout          = 600

  values = [yamlencode({
    fullnameOverride = local.irm_alloy_name

    crds = {
      create = false
    }

    global = {
      podSecurityContext = {
        fsGroup      = 473
        runAsGroup   = 473
        runAsNonRoot = true
        runAsUser    = 473
        seccompProfile = {
          type = "RuntimeDefault"
        }
      }
    }

    alloy = {
      configMap = {
        create = true
        content = templatefile("${path.module}/templates/irm-alloy.config.alloy.tftpl", {
          job_name              = try(var.IRM_CONFIG.job_name, "")
          remote_write_url      = try(var.IRM_CONFIG.grafana_cloud.remote_write_url, "")
          remote_write_username = try(var.IRM_CONFIG.grafana_cloud.username, "")
        })
      }
      enableReporting = false
      extraPorts = [
        {
          name       = "otlp-http"
          port       = 4318
          targetPort = 4318
          protocol   = "TCP"
        }
      ]
      mounts = {
        extra = [
          {
            name      = "alloy-secret"
            mountPath = "/etc/alloy/secret"
            readOnly  = true
          }
        ]
      }
      resources = try(var.IRM_CONFIG.alloy_resources, {})
      securityContext = {
        allowPrivilegeEscalation = false
        capabilities = {
          drop = ["ALL"]
        }
      }
    }

    configReloader = {
      enabled = true
      securityContext = {
        allowPrivilegeEscalation = false
        capabilities = {
          drop = ["ALL"]
        }
      }
    }

    controller = {
      type                          = "deployment"
      replicas                      = 1
      extraLabels                   = local.irm_labels
      podLabels                     = local.irm_labels
      nodeSelector                  = var.NODE_SELECTOR
      terminationGracePeriodSeconds = 60
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
      enabled = true
      type    = "ClusterIP"
    }

    serviceAccount = {
      create                       = true
      automountServiceAccountToken = false
    }

    networkPolicy = {
      enabled = false
    }

    serviceMonitor = {
      enabled = false
    }
  })]

  depends_on = [kubernetes_manifest.irm_grafana_cloud_secret]
}
