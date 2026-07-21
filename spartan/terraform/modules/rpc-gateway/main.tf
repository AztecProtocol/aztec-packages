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
  kong_namespace         = var.KONG_NAMESPACE != "" ? var.KONG_NAMESPACE : var.CONSUMER_NAMESPACE
  kong_helm_release_name = var.KONG_HELM_RELEASE_NAME != "" ? var.KONG_HELM_RELEASE_NAME : "${var.RELEASE_PREFIX}-rpc-kong"
  kong_ingress_class     = var.KONG_INGRESS_CLASS != "" ? var.KONG_INGRESS_CLASS : "${var.RELEASE_PREFIX}-rpc-kong"

  upstream_policy_name         = "${var.RELEASE_PREFIX}-${var.ROUTE_RESOURCE_SUFFIX}-upstream-policy"
  frontend_static_ip_name      = var.FRONTEND_STATIC_IP_NAME != "" ? var.FRONTEND_STATIC_IP_NAME : "${var.RELEASE_PREFIX}-rpc-frontend"
  frontend_service_name        = var.FRONTEND_SERVICE_NAME != "" ? var.FRONTEND_SERVICE_NAME : "${local.kong_helm_release_name}-gateway-proxy"
  frontend_backend_config_name = "${var.RELEASE_PREFIX}-rpc-kong-backend"
  frontend_hosts               = toset(flatten([for _, route in var.ROUTES : route.hosts]))
  managed_certificate_names = {
    for host in local.frontend_hosts :
    host => "${var.RELEASE_PREFIX}-rpc-cert-${replace(host, ".", "-")}"
  }
  managed_certificate_annotation = join(",", [for host in sort(tolist(local.frontend_hosts)) : local.managed_certificate_names[host]])
  frontend_load_balancer_ip      = var.FRONTEND_ENABLED && var.FRONTEND_STATIC_IP_ENABLED ? try(google_compute_global_address.frontend[0].address, "") : ""
  kong_trusted_ips               = concat(var.KONG_TRUSTED_IP_RANGES, var.FRONTEND_ENABLED && var.FRONTEND_STATIC_IP_ENABLED ? [local.frontend_load_balancer_ip] : [])

  kong_proxy_service_annotations = merge(
    var.FRONTEND_ENABLED ? {
      "cloud.google.com/neg"            = jsonencode({ ingress = true })
      "cloud.google.com/backend-config" = jsonencode({ ports = { tostring(var.FRONTEND_SERVICE_PORT) = local.frontend_backend_config_name } })
    } : {},
    var.KONG_PROXY_SERVICE_ANNOTATIONS
  )

  routes_with_anonymous = {
    for name, route in var.ROUTES : name => route
    if route.auth_mode == "keyed_with_anonymous"
  }

  routes_with_consumer_groups = {
    for name, route in var.ROUTES : name => route
    if length(route.allowed_consumer_groups) > 0
  }

  routes_with_cors = {
    for name, route in var.ROUTES : name => route
    if var.ENABLE_CORS
  }

  default_cors_allowed_headers = distinct(compact([
    "Accept",
    "Content-Type",
    var.API_KEY_HEADER_NAME,
  ]))

  route_plugin_names = {
    for name, route in var.ROUTES :
    name => join(",", compact([
      var.ENABLE_CORS ? "${var.RELEASE_PREFIX}-${name}-${var.ROUTE_RESOURCE_SUFFIX}-cors" : "",
      "${var.RELEASE_PREFIX}-${name}-${var.ROUTE_RESOURCE_SUFFIX}-path-api-key",
      "${var.RELEASE_PREFIX}-${name}-${var.ROUTE_RESOURCE_SUFFIX}-key-auth",
      length(route.allowed_consumer_groups) > 0 ? "${var.RELEASE_PREFIX}-${name}-${var.ROUTE_RESOURCE_SUFFIX}-acl" : "",
      "${var.RELEASE_PREFIX}-${name}-${var.ROUTE_RESOURCE_SUFFIX}-prometheus"
    ]))
  }

  cors_plugin_config_secret_names = {
    for name, _ in var.ROUTES :
    name => "${var.RELEASE_PREFIX}-${name}-${var.ROUTE_RESOURCE_SUFFIX}-cors-config"
  }

  acl_plugin_config_secret_names = {
    for name, _ in local.routes_with_consumer_groups :
    name => "${var.RELEASE_PREFIX}-${name}-${var.ROUTE_RESOURCE_SUFFIX}-acl-config"
  }

  metrics_service_enabled = var.KONG_METRICS_SERVICE_ENABLED
  metrics_service_name    = var.KONG_METRICS_SERVICE_NAME != "" ? var.KONG_METRICS_SERVICE_NAME : "${var.RELEASE_PREFIX}-kong-metrics"
  metrics_service_selector = length(var.KONG_METRICS_SERVICE_SELECTOR) > 0 ? var.KONG_METRICS_SERVICE_SELECTOR : {
    "app.kubernetes.io/name"      = "gateway"
    "app.kubernetes.io/component" = "app"
    "app.kubernetes.io/instance"  = local.kong_helm_release_name
  }


  consumer_credential_secret_names = {
    for name, _ in var.CONSUMERS :
    name => "${var.RELEASE_PREFIX}-${name}-${var.ROUTE_RESOURCE_SUFFIX}-key-auth"
  }

  consumer_group_credentials = {
    for credential in flatten([
      for consumer_name, consumer in var.CONSUMERS : [
        for group in consumer.consumer_groups : {
          key           = "${consumer_name}/${group}"
          consumer_name = consumer_name
          group         = group
        }
      ]
    ]) : credential.key => credential
  }

  consumer_acl_credential_secret_names = {
    for key, credential in local.consumer_group_credentials :
    key => "${var.RELEASE_PREFIX}-${credential.consumer_name}-${credential.group}-${var.ROUTE_RESOURCE_SUFFIX}-acl"
  }

  anonymous_consumer_group_credentials = {
    for credential in flatten([
      for route_name, route in local.routes_with_anonymous : [
        for group in route.allowed_consumer_groups : {
          key             = "${route_name}/${group}"
          route_name      = route_name
          route_namespace = route.route_namespace
          group           = group
        }
      ]
    ]) : credential.key => credential
  }

  anonymous_consumer_acl_credential_secret_names = {
    for key, credential in local.anonymous_consumer_group_credentials :
    key => "${var.RELEASE_PREFIX}-${credential.route_name}-anonymous-${credential.group}-${var.ROUTE_RESOURCE_SUFFIX}-acl"
  }

  consumers_with_rate_limit = {
    for name, consumer in var.CONSUMERS :
    name => consumer
    if consumer.rate_limit_minute > 0
  }
}

resource "helm_release" "kong" {
  count = var.INSTALL_KONG ? 1 : 0

  name             = local.kong_helm_release_name
  repository       = "https://charts.konghq.com"
  chart            = "ingress"
  version          = var.KONG_HELM_CHART_VERSION
  namespace        = local.kong_namespace
  create_namespace = true
  upgrade_install  = true
  skip_crds        = true
  wait             = true
  timeout          = 600

  values = concat([
    yamlencode({
      gateway = {
        env = merge(
          {
            database          = "off"
            real_ip_header    = "X-Forwarded-For"
            real_ip_recursive = "on"
          },
          length(local.kong_trusted_ips) > 0 ? {
            trusted_ips = join(",", local.kong_trusted_ips)
          } : {}
        )
        proxy = {
          type                     = var.KONG_PROXY_SERVICE_TYPE
          annotations              = local.kong_proxy_service_annotations
          loadBalancerIP           = var.KONG_PROXY_SERVICE_LOAD_BALANCER_IP
          loadBalancerSourceRanges = var.KONG_PROXY_SERVICE_LOAD_BALANCER_SOURCE_RANGES
        }
        serviceMonitor = {
          enabled = var.KONG_SERVICE_MONITOR_ENABLED
        }
        nodeSelector = var.KONG_NODE_SELECTOR
      }
      controller = {
        ingressController = {
          ingressClass = local.kong_ingress_class
          installCRDs  = false
        }
        nodeSelector = var.KONG_NODE_SELECTOR
      }
    })
  ], var.KONG_EXTRA_HELM_VALUES)
}

resource "google_compute_global_address" "frontend" {
  count = var.FRONTEND_ENABLED && var.FRONTEND_STATIC_IP_ENABLED ? 1 : 0

  name        = local.frontend_static_ip_name
  description = "Global static IP for ${var.RELEASE_PREFIX} RPC frontend Ingress"
}

resource "kubernetes_manifest" "managed_certificate" {
  for_each = var.FRONTEND_ENABLED && var.GCP_MANAGED_CERTIFICATE_ENABLED ? local.managed_certificate_names : {}

  manifest = {
    apiVersion = "networking.gke.io/v1"
    kind       = "ManagedCertificate"
    metadata = {
      name      = each.value
      namespace = local.kong_namespace
    }
    spec = {
      domains = [each.key]
    }
  }

  depends_on = [helm_release.kong]
}

resource "kubernetes_manifest" "frontend_backend_config" {
  count = var.FRONTEND_ENABLED ? 1 : 0

  manifest = {
    apiVersion = "cloud.google.com/v1"
    kind       = "BackendConfig"
    metadata = {
      name      = local.frontend_backend_config_name
      namespace = local.kong_namespace
    }
    spec = {
      healthCheck = {
        type        = "HTTP"
        requestPath = "/status"
        port        = 8100
      }
      customRequestHeaders = {
        headers = ["X-Forwarded-For:{client_ip_address},{server_ip_address}"]
      }
    }
  }

  depends_on = [helm_release.kong]
}

resource "kubernetes_manifest" "frontend_ingress" {
  count = var.FRONTEND_ENABLED ? 1 : 0

  manifest = {
    apiVersion = "networking.k8s.io/v1"
    kind       = "Ingress"
    metadata = {
      name      = "${var.RELEASE_PREFIX}-rpc-frontend"
      namespace = local.kong_namespace
      annotations = merge(
        {
          "kubernetes.io/ingress.class"                 = var.FRONTEND_INGRESS_CLASS
          "kubernetes.io/ingress.global-static-ip-name" = local.frontend_static_ip_name
          "kubernetes.io/ingress.allow-http"            = tostring(var.FRONTEND_ALLOW_HTTP)
        },
        var.GCP_MANAGED_CERTIFICATE_ENABLED ? {
          "networking.gke.io/managed-certificates" = local.managed_certificate_annotation
        } : {}
      )
    }
    spec = {
      ingressClassName = var.FRONTEND_INGRESS_CLASS
      rules = [
        for host in sort(tolist(local.frontend_hosts)) : {
          host = host
          http = {
            paths = [
              {
                path     = "/"
                pathType = "Prefix"
                backend = {
                  service = {
                    name = local.frontend_service_name
                    port = {
                      number = var.FRONTEND_SERVICE_PORT
                    }
                  }
                }
              }
            ]
          }
        }
      ]
    }
  }

  lifecycle {
    precondition {
      condition     = !var.FRONTEND_STATIC_IP_ENABLED || local.frontend_load_balancer_ip != ""
      error_message = "Frontend DNS requires FRONTEND_STATIC_IP_ENABLED=true or an explicit represented frontend IP path."
    }
  }

  depends_on = [
    helm_release.kong,
    kubernetes_manifest.managed_certificate,
    kubernetes_manifest.frontend_backend_config,
  ]
}

resource "google_dns_record_set" "rpc" {
  for_each     = var.CREATE_DNS ? local.frontend_hosts : toset([])
  managed_zone = var.DNS_ZONE_NAME
  name         = "${each.value}."
  type         = "A"
  ttl          = var.DNS_TTL
  rrdatas      = [local.frontend_load_balancer_ip]

  lifecycle {
    precondition {
      condition     = local.frontend_load_balancer_ip != ""
      error_message = "DNS records require FRONTEND_ENABLED=true and FRONTEND_STATIC_IP_ENABLED=true."
    }
  }

  depends_on = [kubernetes_manifest.frontend_ingress]
}

resource "kubernetes_manifest" "path_api_key_plugin" {
  for_each = var.ROUTES

  manifest = {
    apiVersion = "configuration.konghq.com/v1"
    kind       = "KongPlugin"
    metadata = {
      name      = "${var.RELEASE_PREFIX}-${each.key}-${var.ROUTE_RESOURCE_SUFFIX}-path-api-key"
      namespace = each.value.route_namespace
      annotations = {
        "kubernetes.io/ingress.class" = local.kong_ingress_class
      }
    }
    plugin = "pre-function"
    config = {
      access = [
        <<-LUA
        if not kong.request.get_header("${var.API_KEY_HEADER_NAME}") then
          local path = kong.request.get_path()
          local api_key, upstream_path = path:match("^/([^/]+)/?(.*)$")

          if api_key and api_key ~= "" then
            ngx.req.set_header("${var.API_KEY_HEADER_NAME}", ngx.unescape_uri(api_key))

            if upstream_path == "" then
              kong.service.request.set_path("/")
            else
              kong.service.request.set_path("/" .. upstream_path)
            end
          end
        end
        LUA
      ]
    }
  }

  depends_on = [helm_release.kong]
}

resource "kubernetes_secret_v1" "cors_plugin_config" {
  for_each = local.routes_with_cors

  metadata {
    name      = local.cors_plugin_config_secret_names[each.key]
    namespace = each.value.route_namespace
  }

  data = {
    config = jsonencode({
      origins            = ["*"]
      methods            = ["GET", "POST", "OPTIONS"]
      headers            = local.default_cors_allowed_headers
      exposed_headers    = []
      credentials        = false
      max_age            = 3600
      preflight_continue = false
    })
  }

  type = "Opaque"

  depends_on = [helm_release.kong]
}

resource "kubernetes_manifest" "cors_plugin" {
  for_each = local.routes_with_cors

  manifest = {
    apiVersion = "configuration.konghq.com/v1"
    kind       = "KongPlugin"
    metadata = {
      name      = "${var.RELEASE_PREFIX}-${each.key}-${var.ROUTE_RESOURCE_SUFFIX}-cors"
      namespace = each.value.route_namespace
      annotations = {
        "kubernetes.io/ingress.class" = local.kong_ingress_class
      }
    }
    plugin = "cors"
    configFrom = {
      secretKeyRef = {
        name = local.cors_plugin_config_secret_names[each.key]
        key  = "config"
      }
    }
  }

  depends_on = [helm_release.kong, kubernetes_secret_v1.cors_plugin_config]
}

resource "kubernetes_manifest" "key_auth_plugin" {
  for_each = var.ROUTES

  manifest = {
    apiVersion = "configuration.konghq.com/v1"
    kind       = "KongPlugin"
    metadata = {
      name      = "${var.RELEASE_PREFIX}-${each.key}-${var.ROUTE_RESOURCE_SUFFIX}-key-auth"
      namespace = each.value.route_namespace
      annotations = {
        "kubernetes.io/ingress.class" = local.kong_ingress_class
      }
    }
    plugin = "key-auth"
    config = merge(
      {
        key_names        = [var.API_KEY_HEADER_NAME]
        hide_credentials = true
        key_in_body      = false
        key_in_header    = true
        key_in_query     = false
      },
      each.value.auth_mode == "keyed_with_anonymous" ? {
        anonymous = "${var.RELEASE_PREFIX}-${each.key}-anonymous"
      } : {}
    )
  }

  depends_on = [helm_release.kong, kubernetes_manifest.anonymous_consumer]
}

resource "kubernetes_secret_v1" "acl_plugin_config" {
  for_each = local.routes_with_consumer_groups

  metadata {
    name      = local.acl_plugin_config_secret_names[each.key]
    namespace = each.value.route_namespace
  }

  data = {
    config = jsonencode({
      allow              = each.value.allowed_consumer_groups
      hide_groups_header = true
    })
  }

  type = "Opaque"

  depends_on = [helm_release.kong]
}

resource "kubernetes_manifest" "acl_plugin" {
  for_each = local.routes_with_consumer_groups

  manifest = {
    apiVersion = "configuration.konghq.com/v1"
    kind       = "KongPlugin"
    metadata = {
      name      = "${var.RELEASE_PREFIX}-${each.key}-${var.ROUTE_RESOURCE_SUFFIX}-acl"
      namespace = each.value.route_namespace
      annotations = {
        "kubernetes.io/ingress.class" = local.kong_ingress_class
      }
    }
    plugin = "acl"
    configFrom = {
      secretKeyRef = {
        name = local.acl_plugin_config_secret_names[each.key]
        key  = "config"
      }
    }
  }

  depends_on = [helm_release.kong, kubernetes_secret_v1.acl_plugin_config]
}

resource "kubernetes_manifest" "prometheus_plugin" {
  for_each = var.ROUTES

  manifest = {
    apiVersion = "configuration.konghq.com/v1"
    kind       = "KongPlugin"
    metadata = {
      name      = "${var.RELEASE_PREFIX}-${each.key}-${var.ROUTE_RESOURCE_SUFFIX}-prometheus"
      namespace = each.value.route_namespace
      annotations = {
        "kubernetes.io/ingress.class" = local.kong_ingress_class
      }
    }
    plugin = "prometheus"
    config = {
      per_consumer            = true
      status_code_metrics     = true
      latency_metrics         = true
      bandwidth_metrics       = true
      upstream_health_metrics = true
    }
  }

  depends_on = [helm_release.kong]
}

resource "kubernetes_manifest" "upstream_policy" {
  for_each = var.UPSTREAM_POLICY_ENABLED ? toset(distinct([for _, route in var.ROUTES : route.route_namespace])) : toset([])

  manifest = {
    apiVersion = "configuration.konghq.com/v1beta1"
    kind       = "KongUpstreamPolicy"
    metadata = {
      name      = local.upstream_policy_name
      namespace = each.value
      annotations = {
        "kubernetes.io/ingress.class" = local.kong_ingress_class
      }
    }
    spec = {
      algorithm = "consistent-hashing"
      hashOn = {
        input = "ip"
      }
      healthchecks = {
        active = {
          type        = "http"
          httpPath    = "/status"
          timeout     = 3
          concurrency = 10
          healthy = {
            interval     = 10
            successes    = 1
            httpStatuses = [200]
          }
          unhealthy = {
            interval     = 5
            httpFailures = 3
            tcpFailures  = 3
            timeouts     = 3
            httpStatuses = [404, 429, 500, 501, 502, 503, 504, 505]
          }
        }
      }
    }
  }

  depends_on = [helm_release.kong]
}

resource "kubernetes_manifest" "consumer_rate_limit_plugin" {
  for_each = local.consumers_with_rate_limit

  manifest = {
    apiVersion = "configuration.konghq.com/v1"
    kind       = "KongPlugin"
    metadata = {
      name      = "${var.RELEASE_PREFIX}-${each.key}-${var.ROUTE_RESOURCE_SUFFIX}-rate-limit"
      namespace = var.CONSUMER_NAMESPACE
      annotations = {
        "kubernetes.io/ingress.class" = local.kong_ingress_class
      }
    }
    plugin = "rate-limiting"
    config = {
      minute         = each.value.rate_limit_minute
      policy         = "local"
      limit_by       = "consumer"
      fault_tolerant = true
    }
  }

  depends_on = [helm_release.kong]
}

resource "kubernetes_manifest" "consumer_key_external_secret" {
  for_each = var.CONSUMERS

  manifest = {
    apiVersion = "external-secrets.io/v1"
    kind       = "ExternalSecret"
    metadata = {
      name      = "${var.RELEASE_PREFIX}-${each.key}-${var.ROUTE_RESOURCE_SUFFIX}-key-auth"
      namespace = var.CONSUMER_NAMESPACE
    }
    spec = {
      refreshInterval = var.EXTERNAL_SECRET_REFRESH_INTERVAL
      secretStoreRef = {
        name = var.EXTERNAL_SECRET_STORE_NAME
        kind = var.EXTERNAL_SECRET_STORE_KIND
      }
      target = {
        name           = local.consumer_credential_secret_names[each.key]
        creationPolicy = "Owner"
        template = {
          metadata = {
            labels = {
              "konghq.com/credential" = "key-auth"
            }
          }
          type = "Opaque"
          data = {
            key = "{{ .api_key }}"
          }
        }
      }
      data = [
        {
          secretKey = "api_key"
          remoteRef = {
            key = each.value.gcp_secret_manager_secret_name
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

  depends_on = [helm_release.kong]
}

resource "kubernetes_manifest" "consumer_acl_secret" {
  for_each = local.consumer_group_credentials

  manifest = {
    apiVersion = "v1"
    kind       = "Secret"
    metadata = {
      name      = local.consumer_acl_credential_secret_names[each.key]
      namespace = var.CONSUMER_NAMESPACE
      labels = {
        "konghq.com/credential" = "acl"
      }
    }
    type = "Opaque"
    data = {
      group = base64encode(each.value.group)
    }
  }

  depends_on = [helm_release.kong]
}

resource "kubernetes_manifest" "consumer" {
  for_each = var.CONSUMERS

  manifest = {
    apiVersion = "configuration.konghq.com/v1"
    kind       = "KongConsumer"
    metadata = merge(
      {
        name      = "${var.RELEASE_PREFIX}-${each.key}"
        namespace = var.CONSUMER_NAMESPACE
        annotations = {
          "kubernetes.io/ingress.class" = local.kong_ingress_class
        }
      },
      each.value.rate_limit_minute > 0 ? {
        annotations = {
          "kubernetes.io/ingress.class" = local.kong_ingress_class
          "konghq.com/plugins"          = "${var.RELEASE_PREFIX}-${each.key}-${var.ROUTE_RESOURCE_SUFFIX}-rate-limit"
        }
      } : {}
    )
    username = each.value.username != "" ? each.value.username : each.key
    credentials = concat(
      [local.consumer_credential_secret_names[each.key]],
      [for group in each.value.consumer_groups : local.consumer_acl_credential_secret_names["${each.key}/${group}"]]
    )
  }

  depends_on = [
    kubernetes_manifest.consumer_key_external_secret,
    kubernetes_manifest.consumer_acl_secret,
    kubernetes_manifest.consumer_rate_limit_plugin,
  ]
}

resource "kubernetes_manifest" "anonymous_rate_limit_plugin" {
  for_each = local.routes_with_anonymous

  manifest = {
    apiVersion = "configuration.konghq.com/v1"
    kind       = "KongPlugin"
    metadata = {
      name      = "${var.RELEASE_PREFIX}-${each.key}-anonymous-${var.ROUTE_RESOURCE_SUFFIX}-rate-limit"
      namespace = each.value.route_namespace
      annotations = {
        "kubernetes.io/ingress.class" = local.kong_ingress_class
      }
    }
    plugin = "rate-limiting"
    config = {
      minute         = each.value.anonymous_rate_limit_minute
      policy         = "local"
      limit_by       = "ip"
      fault_tolerant = true
    }
  }

  depends_on = [helm_release.kong]
}

resource "kubernetes_manifest" "anonymous_consumer_acl_secret" {
  for_each = local.anonymous_consumer_group_credentials

  manifest = {
    apiVersion = "v1"
    kind       = "Secret"
    metadata = {
      name      = local.anonymous_consumer_acl_credential_secret_names[each.key]
      namespace = each.value.route_namespace
      labels = {
        "konghq.com/credential" = "acl"
      }
    }
    type = "Opaque"
    data = {
      group = base64encode(each.value.group)
    }
  }

  depends_on = [helm_release.kong]
}

resource "kubernetes_manifest" "anonymous_consumer" {
  for_each = local.routes_with_anonymous

  manifest = merge(
    {
      apiVersion = "configuration.konghq.com/v1"
      kind       = "KongConsumer"
      metadata = {
        name      = "${var.RELEASE_PREFIX}-${each.key}-anonymous"
        namespace = each.value.route_namespace
        annotations = {
          "kubernetes.io/ingress.class" = local.kong_ingress_class
          "konghq.com/plugins"          = "${var.RELEASE_PREFIX}-${each.key}-anonymous-${var.ROUTE_RESOURCE_SUFFIX}-rate-limit"
        }
      }
      username = "${var.RELEASE_PREFIX}-${each.key}-anonymous"
    },
    length(each.value.allowed_consumer_groups) > 0 ? {
      credentials = [for group in each.value.allowed_consumer_groups : local.anonymous_consumer_acl_credential_secret_names["${each.key}/${group}"]]
    } : {}
  )

  depends_on = [
    kubernetes_manifest.anonymous_rate_limit_plugin,
    kubernetes_manifest.anonymous_consumer_acl_secret,
  ]
}

resource "kubernetes_service_v1" "metrics" {
  count = local.metrics_service_enabled ? 1 : 0

  metadata {
    name        = local.metrics_service_name
    namespace   = local.kong_namespace
    annotations = var.KONG_METRICS_SERVICE_ANNOTATIONS
    labels = {
      "app.kubernetes.io/name"      = "kong-metrics"
      "app.kubernetes.io/instance"  = local.kong_helm_release_name
      "app.kubernetes.io/component" = "metrics"
    }
  }

  spec {
    type                        = var.KONG_METRICS_SERVICE_TYPE
    load_balancer_ip            = var.KONG_METRICS_SERVICE_LOAD_BALANCER_IP != "" ? var.KONG_METRICS_SERVICE_LOAD_BALANCER_IP : null
    load_balancer_source_ranges = var.KONG_METRICS_SERVICE_LOAD_BALANCER_SOURCE_RANGES
    external_traffic_policy     = var.KONG_METRICS_SERVICE_EXTERNAL_TRAFFIC_POLICY

    port {
      name        = "status"
      port        = var.KONG_METRICS_SERVICE_PORT
      target_port = "status"
      protocol    = "TCP"
    }

    selector = local.metrics_service_selector
  }

  depends_on = [helm_release.kong]
}

resource "kubernetes_manifest" "rpc_route" {
  for_each = var.ROUTES

  manifest = {
    apiVersion = "networking.k8s.io/v1"
    kind       = "Ingress"
    metadata = {
      name      = "${var.RELEASE_PREFIX}-${each.key}-${var.ROUTE_RESOURCE_SUFFIX}"
      namespace = each.value.route_namespace
      annotations = merge(
        {
          "kubernetes.io/ingress.class" = local.kong_ingress_class
          "konghq.com/plugins"          = local.route_plugin_names[each.key]
          "konghq.com/strip-path"       = tostring(each.value.strip_path)
        },
        var.ROUTE_ANNOTATIONS
      )
    }
    spec = merge(
      {
        ingressClassName = local.kong_ingress_class
        rules = [
          for host in each.value.hosts : {
            host = host
            http = {
              paths = [
                {
                  path     = each.value.path
                  pathType = each.value.path_type
                  backend = {
                    service = {
                      name = each.value.upstream_service_name
                      port = {
                        number = each.value.upstream_service_port
                      }
                    }
                  }
                }
              ]
            }
          }
        ]
      },
      var.TLS_ENABLED ? {
        tls = [
          {
            hosts      = each.value.hosts
            secretName = var.TLS_SECRET_NAME
          }
        ]
      } : {}
    )
  }

  depends_on = [
    kubernetes_manifest.cors_plugin,
    kubernetes_manifest.path_api_key_plugin,
    kubernetes_manifest.key_auth_plugin,
    kubernetes_manifest.acl_plugin,
    kubernetes_manifest.prometheus_plugin,
    kubernetes_manifest.upstream_policy,
  ]
}
