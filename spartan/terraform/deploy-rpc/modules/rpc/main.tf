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
  aztec_image_parts      = split(":", var.AZTEC_DOCKER_IMAGE)
  aztec_image_repository = join(":", slice(local.aztec_image_parts, 0, length(local.aztec_image_parts) - 1))
  aztec_image_tag        = local.aztec_image_parts[length(local.aztec_image_parts) - 1]

  workload_name        = "${var.RELEASE_NAME}-aztec-node"
  l1_secret_name       = "${var.RELEASE_NAME}-l1"
  otel_secret_name     = "${var.RELEASE_NAME}-otel"
  upstream_policy_name = "${var.RELEASE_PREFIX}-rpc-upstream-policy"
}

resource "helm_release" "rpc" {
  name             = var.RELEASE_NAME
  chart            = "${path.module}/../../../../aztec-node"
  namespace        = var.NAMESPACE
  create_namespace = false
  upgrade_install  = true
  force_update     = var.FORCE_UPDATE
  recreate_pods    = var.RECREATE_PODS
  reuse_values     = false
  timeout          = 3600 # 1h to sync
  wait             = true
  wait_for_jobs    = true
  take_ownership   = true

  values = concat([
    file("${path.module}/values/prod.yaml"),
    file("${path.module}/values/prod-res.yaml"),
    yamlencode({
      fullnameOverride = local.workload_name
      replicaCount     = var.MIN_REPLICAS
      extraObjects = concat(
        [
          {
            apiVersion = "external-secrets.io/v1"
            kind       = "ExternalSecret"
            metadata = {
              name      = local.l1_secret_name
              namespace = var.NAMESPACE
            }
            spec = {
              refreshInterval = "1m"
              secretStoreRef = {
                name = "gcp-secret-store"
                kind = "ClusterSecretStore"
              }
              target = {
                name           = local.l1_secret_name
                creationPolicy = "Owner"
                template = {
                  engineVersion = "v2"
                  type          = "Opaque"
                  data = {
                    ETHEREUM_HOSTS                    = "{{`{{ .ethereumHostsJson | fromJson | join \",\" }}`}}"
                    L1_CONSENSUS_HOST_URLS            = "{{`{{ .consensusHostUrlsJson | fromJson | join \",\" }}`}}"
                    L1_CONSENSUS_HOST_API_KEYS        = "{{`{{ .consensusHostApiKeysJson | fromJson | join \",\" }}`}}"
                    L1_CONSENSUS_HOST_API_KEY_HEADERS = "{{`{{ .consensusHostApiKeyHeadersJson | fromJson | join \",\" }}`}}"
                  }
                }
              }
              data = [
                {
                  secretKey = "ethereumHostsJson"
                  remoteRef = {
                    key = var.L1_RPC_SECRET_NAME
                  }
                },
                {
                  secretKey = "consensusHostUrlsJson"
                  remoteRef = {
                    key = var.L1_CONSENSUS_HOST_URLS_SECRET_NAME
                  }
                },
                {
                  secretKey = "consensusHostApiKeysJson"
                  remoteRef = {
                    key = var.L1_CONSENSUS_HOST_API_KEYS_SECRET_NAME
                  }
                },
                {
                  secretKey = "consensusHostApiKeyHeadersJson"
                  remoteRef = {
                    key = var.L1_CONSENSUS_HOST_API_KEY_HEADERS_SECRET_NAME
                  }
                }
              ]
            }
          }
        ],
        var.OTEL_COLLECTOR_ENDPOINT_GCP_SECRET_NAME != "" ? [
          {
            apiVersion = "external-secrets.io/v1"
            kind       = "ExternalSecret"
            metadata = {
              name      = local.otel_secret_name
              namespace = var.NAMESPACE
            }
            spec = {
              refreshInterval = "1m"
              secretStoreRef = {
                name = "gcp-secret-store"
                kind = "ClusterSecretStore"
              }
              target = {
                name           = local.otel_secret_name
                creationPolicy = "Owner"
                template = {
                  engineVersion = "v2"
                  type          = "Opaque"
                  data = {
                    OTEL_EXPORTER_OTLP_METRICS_ENDPOINT = "{{`{{ .otelCollectorEndpoint | trimSuffix \"/\" }}`}}/v1/metrics"
                    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT  = "{{`{{ .otelCollectorEndpoint | trimSuffix \"/\" }}`}}/v1/traces"
                  }
                }
              }
              data = [
                {
                  secretKey = "otelCollectorEndpoint"
                  remoteRef = {
                    key = var.OTEL_COLLECTOR_ENDPOINT_GCP_SECRET_NAME
                  }
                }
              ]
            }
          }
        ] : []
      )

      global = {
        aztecImage = {
          repository = local.aztec_image_repository
          tag        = local.aztec_image_tag
          pullPolicy = "Always"
        }
        aztecEnv              = var.ENV
        useGcloudLogging      = true
        otelCollectorEndpoint = ""
      }

      node = {
        logLevel = var.LOG_LEVEL
        startupProbe = {
          failureThreshold = 120
        }
        env = {
          OTEL_SERVICE_NAME = var.RELEASE_NAME
        }
        envFrom = {
          secrets = concat(
            [{ name = local.l1_secret_name }],
            var.OTEL_COLLECTOR_ENDPOINT_GCP_SECRET_NAME != "" ? [{ name = local.otel_secret_name }] : []
          )
        }
        proverRealProofs = true
        updateStrategy = {
          type = "RollingUpdate"
        }
      }

      persistence = {
        enabled = true
      }

      statefulSet = {
        enabled = true
        volumeClaimTemplates = [
          {
            metadata = {
              name = "data"
            }
            spec = {
              accessModes = ["ReadWriteOnce"]
              resources = {
                requests = {
                  storage = var.STORAGE_SIZE
                }
              }
            }
          }
        ]
      }

      service = {
        rpc = {
          enabled = true
          port    = 8080
          type    = "ClusterIP"
          annotations = {
            "konghq.com/upstream-policy" = local.upstream_policy_name
          }
        }
        admin = {
          enabled = false
        }
        p2p = {
          enabled         = true
          nodePortEnabled = false
          publicIP        = true
          port            = 40400
          announcePort    = 40400
        }
      }
    })
  ], var.EXTRA_HELM_VALUES)
}

resource "kubernetes_manifest" "hpa" {
  manifest = {
    apiVersion = "autoscaling/v2"
    kind       = "HorizontalPodAutoscaler"
    metadata = {
      name      = "${local.workload_name}-hpa"
      namespace = var.NAMESPACE
    }
    spec = {
      scaleTargetRef = {
        apiVersion = "apps/v1"
        kind       = "StatefulSet"
        name       = local.workload_name
      }
      minReplicas = var.MIN_REPLICAS
      maxReplicas = 4
      behavior = {
        scaleUp = {
          stabilizationWindowSeconds = 600
          selectPolicy               = "Max"
          policies = [
            {
              type          = "Pods"
              value         = 4
              periodSeconds = 15
            },
            {
              type          = "Percent"
              value         = 100
              periodSeconds = 15
            }
          ]
        }
        scaleDown = {
          stabilizationWindowSeconds = 300
          selectPolicy               = "Max"
          policies = [
            {
              type          = "Percent"
              value         = 100
              periodSeconds = 15
            }
          ]
        }
      }
      metrics = [
        {
          type = "Resource"
          resource = {
            name = "cpu"
            target = {
              type               = "Utilization"
              averageUtilization = 70
            }
          }
        }
      ]
    }
  }

  depends_on = [helm_release.rpc]
}
