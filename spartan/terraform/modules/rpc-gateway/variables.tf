variable "RELEASE_PREFIX" {
  description = "Prefix used for generated Kubernetes and GCP resources."
  type        = string
}

variable "CONSUMER_NAMESPACE" {
  description = "Namespace for named KongConsumer resources and their credential secrets."
  type        = string
}

variable "INSTALL_KONG" {
  description = "Whether this module should install Kong Gateway and Kong Ingress Controller."
  type        = bool
  default     = true
}

variable "KONG_NAMESPACE" {
  description = "Namespace for the Kong Helm release. Defaults to CONSUMER_NAMESPACE when empty."
  type        = string
  default     = ""
}

variable "KONG_HELM_RELEASE_NAME" {
  description = "Helm release name for Kong. Defaults to RELEASE_PREFIX-rpc-kong when empty."
  type        = string
  default     = ""
}

variable "KONG_HELM_CHART_VERSION" {
  description = "Kong ingress Helm chart version."
  type        = string
  default     = "0.24.0"
}

variable "KONG_INGRESS_CLASS" {
  description = "Ingress class watched by Kong Ingress Controller. Defaults to RELEASE_PREFIX-rpc-kong when empty."
  type        = string
  default     = ""
}

variable "KONG_PROXY_SERVICE_TYPE" {
  description = "Kong proxy Kubernetes Service type."
  type        = string
  default     = "ClusterIP"
}

variable "KONG_PROXY_SERVICE_ANNOTATIONS" {
  description = "Annotations applied to the Kong proxy Service by the Helm chart."
  type        = map(string)
  default     = {}
}

variable "KONG_PROXY_SERVICE_LOAD_BALANCER_IP" {
  description = "Optional static IP assigned to the Kong proxy LoadBalancer Service."
  type        = string
  default     = ""
}

variable "KONG_PROXY_SERVICE_LOAD_BALANCER_SOURCE_RANGES" {
  description = "Optional source CIDRs allowed to reach the Kong proxy LoadBalancer Service."
  type        = list(string)
  default     = []
}

variable "KONG_TRUSTED_IP_RANGES" {
  description = "Trusted proxy CIDR ranges for Kong real IP handling. The frontend load balancer IP is appended automatically when allocated by this module."
  type        = list(string)
  default     = []
}

variable "KONG_NODE_SELECTOR" {
  description = "Node selector applied to Kong gateway and controller pods."
  type        = map(string)
  default     = {}
}

variable "KONG_EXTRA_HELM_VALUES" {
  description = "Additional YAML values passed to the Kong Helm chart."
  type        = list(string)
  default     = []
}

variable "KONG_SERVICE_MONITOR_ENABLED" {
  description = "Whether the Kong Helm chart should create a ServiceMonitor for Prometheus Operator."
  type        = bool
  default     = false
}

variable "KONG_METRICS_SERVICE_ENABLED" {
  description = "Whether to expose Kong's status /metrics endpoint through a Kubernetes Service."
  type        = bool
  default     = false
}

variable "KONG_METRICS_SERVICE_NAME" {
  description = "Optional name for the Kong metrics Service. Defaults to RELEASE_PREFIX-kong-metrics."
  type        = string
  default     = ""
}

variable "KONG_METRICS_SERVICE_TYPE" {
  description = "Kong metrics Service type. ClusterIP is enough for the local OTel collector path."
  type        = string
  default     = "ClusterIP"
}

variable "KONG_METRICS_SERVICE_PORT" {
  description = "Service port for Kong's status /metrics endpoint."
  type        = number
  default     = 8100
}

variable "KONG_METRICS_SERVICE_ANNOTATIONS" {
  description = "Annotations applied to the Kong metrics Service."
  type        = map(string)
  default     = {}
}

variable "KONG_METRICS_SERVICE_LOAD_BALANCER_IP" {
  description = "Optional static IP assigned to the Kong metrics LoadBalancer Service."
  type        = string
  default     = ""
}

variable "KONG_METRICS_SERVICE_LOAD_BALANCER_SOURCE_RANGES" {
  description = "Optional source CIDRs allowed to reach the Kong metrics Service."
  type        = list(string)
  default     = []
}

variable "KONG_METRICS_SERVICE_EXTERNAL_TRAFFIC_POLICY" {
  description = "External traffic policy for the Kong metrics Service. Leave null to use the Kubernetes default."
  type        = string
  default     = null
}

variable "KONG_METRICS_SERVICE_SELECTOR" {
  description = "Optional selector for Kong Gateway pods. Defaults to the kong/ingress gateway pod labels."
  type        = map(string)
  default     = {}
}

variable "API_KEY_HEADER_NAME" {
  description = "Header checked by Kong's key-auth plugin."
  type        = string
  default     = "x-aztec-api-key"
}

variable "TLS_ENABLED" {
  description = "Whether Kong-managed RPC Ingresses should include TLS configuration."
  type        = bool
  default     = false
}

variable "TLS_SECRET_NAME" {
  description = "TLS Secret used by Kong-managed RPC Ingresses when TLS_ENABLED=true."
  type        = string
  default     = ""
}

variable "ROUTES" {
  description = "RPC routes keyed by rollup alias. Route Ingresses are created in route_namespace."
  type = map(object({
    hosts                       = list(string)
    route_namespace             = string
    upstream_service_name       = string
    upstream_service_port       = number
    auth_mode                   = string
    anonymous_rate_limit_minute = number
    path                        = optional(string, "/")
    path_type                   = optional(string, "Prefix")
    strip_path                  = optional(bool, false)
    allowed_consumer_groups     = optional(list(string), [])
  }))

  validation {
    condition = alltrue([
      for _, route in var.ROUTES :
      contains(["keyed_only", "keyed_with_anonymous"], route.auth_mode)
    ])
    error_message = "ROUTES auth_mode must be keyed_only or keyed_with_anonymous."
  }

  validation {
    condition = alltrue([
      for _, route in var.ROUTES : length(route.hosts) > 0
    ])
    error_message = "Every RPC gateway route must define at least one host."
  }
}

variable "ROUTE_RESOURCE_SUFFIX" {
  description = "Suffix used in generated route and plugin resource names."
  type        = string
  default     = "rpc"
}

variable "ROUTE_ANNOTATIONS" {
  description = "Additional annotations applied to every Kong-managed RPC Ingress."
  type        = map(string)
  default     = {}
}

variable "UPSTREAM_POLICY_ENABLED" {
  description = "Whether to create the shared KongUpstreamPolicy used by annotated upstream Services."
  type        = bool
  default     = true
}

variable "CONSUMERS" {
  description = "Kong consumers keyed by team name. Use one credential source per consumer."
  type = map(object({
    username                       = string
    gcp_secret_manager_secret_name = string
    rate_limit_minute              = number
    consumer_groups                = optional(list(string), [])
  }))
  default = {}
}

variable "EXTERNAL_SECRET_STORE_NAME" {
  description = "ExternalSecrets SecretStore or ClusterSecretStore name."
  type        = string
  default     = "gcp-secret-store"
}

variable "EXTERNAL_SECRET_STORE_KIND" {
  description = "ExternalSecrets store kind."
  type        = string
  default     = "ClusterSecretStore"
}

variable "EXTERNAL_SECRET_REFRESH_INTERVAL" {
  description = "ExternalSecret refresh interval."
  type        = string
  default     = "1m"
}

variable "CREATE_DNS" {
  description = "Whether to create A records for RPC hosts in DNS_ZONE_NAME."
  type        = bool
  default     = true
}

variable "DNS_ZONE_NAME" {
  description = "Cloud DNS managed zone name for RPC hosts."
  type        = string
  default     = "rpc-aztec-labs-com"
}

variable "DNS_TTL" {
  description = "TTL for RPC DNS A records."
  type        = number
  default     = 300
}

variable "FRONTEND_ENABLED" {
  description = "Whether to create a GKE Ingress in front of Kong for public HTTP(S) traffic."
  type        = bool
  default     = true
}

variable "FRONTEND_INGRESS_CLASS" {
  description = "Ingress class used by the public frontend Ingress. Use gce for GKE external HTTP(S) Load Balancing."
  type        = string
  default     = "gce"
}

variable "FRONTEND_STATIC_IP_ENABLED" {
  description = "Whether to allocate a global static IP for the public frontend Ingress when FRONTEND_STATIC_IP_NAME is empty."
  type        = bool
  default     = true
}

variable "FRONTEND_STATIC_IP_NAME" {
  description = "Optional global static IP name for the public frontend Ingress. Defaults to RELEASE_PREFIX-rpc-frontend."
  type        = string
  default     = ""
}

variable "FRONTEND_SERVICE_NAME" {
  description = "Optional Kong proxy Service name used as the GKE Ingress backend. Defaults to KONG_HELM_RELEASE_NAME-gateway-proxy."
  type        = string
  default     = ""
}

variable "FRONTEND_SERVICE_PORT" {
  description = "Kong proxy Service port used as the GKE Ingress backend."
  type        = number
  default     = 80
}

variable "FRONTEND_ALLOW_HTTP" {
  description = "Whether the public GKE Ingress should allow HTTP in addition to HTTPS."
  type        = bool
  default     = false
}

variable "GCP_MANAGED_CERTIFICATE_ENABLED" {
  description = "Whether to create a GKE ManagedCertificate for RPC hosts."
  type        = bool
  default     = true
}

variable "ENABLE_CORS" {
  description = "Whether to enable CORS support."
  type        = bool
  default     = true
}
