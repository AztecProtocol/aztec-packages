terraform {
  required_providers {
    helm = {
      source = "hashicorp/helm"
    }
  }
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
    labels             = var.LABELS
    image              = var.IMAGE
    replicas           = var.REPLICAS
    nodeSelector       = var.NODE_SELECTOR
    resources          = var.RESOURCES
  })]
}
