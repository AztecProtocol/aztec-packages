variable "NAMESPACE" {
  description = "Namespace for RPC workloads and Kong routes."
  type        = string
}

variable "RELEASE_PREFIX" {
  description = "Prefix for generated release and Kubernetes resource names."
  type        = string
}

variable "RPCS" {
  description = "RPC instances keyed by public route alias."
  type = map(object({
    aztec_docker_image                            = string
    l1_rpc_secret_name                            = string
    l1_consensus_host_urls_secret_name            = string
    l1_consensus_host_api_keys_secret_name        = string
    l1_consensus_host_api_key_headers_secret_name = string
    hosts                                         = list(string)
    storage_size                                  = string
    env                                           = map(string)
  }))
}

variable "ALLOW_ANONYMOUS" {
  description = "Whether the RPC gateway allows requests without a valid API key. Missing and invalid keys both use the anonymous consumer."
  type        = bool
  default     = false
}

variable "ANONYMOUS_RATE_LIMIT_MINUTE" {
  description = "Per-client-IP anonymous request limit per minute when ALLOW_ANONYMOUS=true. Kong local policy makes this per Kong pod."
  type        = number
  default     = 300
}

variable "OTEL_COLLECTOR_ENDPOINT_GCP_SECRET_NAME" {
  description = "GCP Secret Manager secret containing the OpenTelemetry collector base URL."
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
  description = "Whether to deploy Alloy to forward allowlisted RPC gateway metrics to Grafana Cloud."
  type        = bool
  default     = false
}

variable "IRM_GRAFANA_CLOUD_SECRET_NAME" {
  description = "GCP Secret Manager secret name containing the Grafana Cloud remote-write password/token."
  type        = string
  default     = "grafana-cloud-password"
}

variable "IRM_GRAFANA_CLOUD_REMOTE_WRITE_URL" {
  description = "Grafana Cloud Prometheus remote-write endpoint for RPC IRM metrics."
  type        = string
  default     = "https://prometheus-prod-55-prod-gb-south-1.grafana.net/api/prom/push"
}

variable "IRM_GRAFANA_CLOUD_USERNAME" {
  description = "Grafana Cloud Prometheus remote-write username for RPC IRM metrics."
  type        = string
  default     = "2476101"
}

variable "IRM_ALLOY_SCRAPE_INTERVAL" {
  description = "How often Alloy scrapes the RPC Kong metrics service."
  type        = string
  default     = "60s"
}

variable "IRM_ALLOY_RESOURCES" {
  description = "Resource requests and limits for the RPC IRM Alloy deployment."
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

variable "CONSUMERS" {
  description = "Kong consumers keyed by team name. Configured consumers can use every keyed RPC route in the environment."
  type = map(object({
    username                       = string
    gcp_secret_manager_secret_name = string
    rate_limit_minute              = number
  }))
  default = {}
}
