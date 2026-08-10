variable "API_KEY_SECRET_NAMES" {
  description = "GCP Secret Manager secret names to expose as Kong API key consumers. Secret values are read by ExternalSecrets."
  type        = list(string)
  default = [
    "eth-sepolia-rpc-consumer-client1",
    "eth-sepolia-rpc-consumer-client2",
    "eth-sepolia-rpc-consumer-client3",
    "eth-sepolia-rpc-consumer-client4",
    "eth-sepolia-rpc-consumer-client5",

    "eth-mainnet-rpc-consumer-client1",
  ]
}

variable "CONSUMERS" {
  description = "Kong consumers keyed by name. Each value points at an existing GCP Secret Manager secret containing api_key."
  type = map(object({
    username                       = string
    gcp_secret_manager_secret_name = string
    rate_limit_minute              = number
  }))
  default = {}
}

variable "KONG_HELM_RELEASE_NAME" {
  description = "Optional Helm release name for Kong. Defaults to ethereum-rpc-kong in the shared gateway module."
  type        = string
  default     = ""
}

variable "KONG_HELM_CHART_VERSION" {
  description = "Kong ingress Helm chart version."
  type        = string
  default     = "0.24.0"
}

variable "KONG_INGRESS_CLASS" {
  description = "Optional ingress class watched by Kong. Defaults to ethereum-rpc-kong in the shared gateway module."
  type        = string
  default     = ""
}

variable "KONG_PROXY_SERVICE_TYPE" {
  description = "Kong proxy Service type. With frontend enabled this should normally stay ClusterIP plus NEG annotation."
  type        = string
  default     = "ClusterIP"
}

variable "KONG_PROXY_SERVICE_ANNOTATIONS" {
  description = "Annotations applied to the Kong proxy Service."
  type        = map(string)
  default     = {}
}

variable "KONG_EXTRA_HELM_VALUES" {
  description = "Additional YAML values passed to the Kong Helm chart."
  type        = list(string)
  default     = []
}

variable "KONG_TRUSTED_IP_RANGES" {
  description = "Trusted proxy CIDR ranges for Kong real IP handling."
  type        = list(string)
  default     = ["35.191.0.0/16", "130.211.0.0/22"]
}

variable "KONG_SERVICE_MONITOR_ENABLED" {
  description = "Whether the Kong Helm chart should create a ServiceMonitor."
  type        = bool
  default     = false
}

variable "OTEL_COLLECTOR_ENDPOINT_GCP_SECRET_NAME" {
  description = "GCP Secret Manager secret name containing the central OTLP/HTTP collector endpoint. Empty disables metrics export."
  type        = string
  default     = "otel-collector-url"
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

variable "IRM_METRICS_ENABLED" {
  description = "Whether to forward the mainnet L1 health metric allowlist to Grafana Cloud through Alloy."
  type        = bool
  default     = true
}

variable "IRM_GRAFANA_CLOUD_SECRET_NAME" {
  description = "GCP Secret Manager secret name containing the Grafana Cloud remote-write password/token."
  type        = string
  default     = "grafana-cloud-password"
}

variable "IRM_GRAFANA_CLOUD_REMOTE_WRITE_URL" {
  description = "Grafana Cloud Prometheus remote-write endpoint for L1 IRM metrics."
  type        = string
  default     = "https://prometheus-prod-55-prod-gb-south-1.grafana.net/api/prom/push"
}

variable "IRM_GRAFANA_CLOUD_USERNAME" {
  description = "Grafana Cloud Prometheus remote-write username for L1 IRM metrics."
  type        = string
  default     = "2476101"
}

variable "IRM_ALLOY_RESOURCES" {
  description = "Resource requests and limits for the L1 IRM Alloy deployment."
  type = object({
    requests = map(string)
    limits   = map(string)
  })
  default = {
    requests = {
      cpu    = "50m"
      memory = "64Mi"
    }
    limits = {
      cpu    = "100m"
      memory = "128Mi"
    }
  }
}

variable "CREATE_DNS" {
  description = "Whether to create A records for Ethereum gateway hosts."
  type        = bool
  default     = true
}

variable "DNS_ZONE_NAME" {
  description = "Cloud DNS managed zone name for Ethereum gateway hosts."
  type        = string
  default     = "rpc-aztec-labs-com"
}

variable "DNS_TTL" {
  description = "TTL for Ethereum gateway DNS A records."
  type        = number
  default     = 300
}

variable "FRONTEND_ENABLED" {
  description = "Whether to create a GKE frontend Ingress in front of Kong."
  type        = bool
  default     = true
}

variable "FRONTEND_STATIC_IP_ENABLED" {
  description = "Whether to allocate a global static IP for the Ethereum gateway frontend."
  type        = bool
  default     = true
}

variable "FRONTEND_STATIC_IP_NAME" {
  description = "Optional global static IP name for the Ethereum gateway frontend. Defaults to ethereum-rpc-frontend in the shared gateway module."
  type        = string
  default     = ""
}

variable "GCP_MANAGED_CERTIFICATE_ENABLED" {
  description = "Whether to create GKE ManagedCertificates for Ethereum gateway hosts."
  type        = bool
  default     = true
}
