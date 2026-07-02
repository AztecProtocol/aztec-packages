variable "NAMESPACE" {
  description = "Kubernetes namespace to deploy the metrics collector into."
  type        = string
}

variable "RELEASE_NAME" {
  description = "Name used for collector Kubernetes resources."
  type        = string
}

variable "OTEL_COLLECTOR_ENDPOINT_GCP_SECRET_NAME" {
  description = "GCP Secret Manager secret name containing the central OTLP/HTTP collector endpoint."
  type        = string
}

variable "SCRAPE_CONFIGS" {
  description = "Prometheus scrape configs for the local collector."
  type = list(object({
    job_name        = string
    targets         = list(string)
    metrics_path    = optional(string, "/metrics")
    scrape_interval = optional(string, "15s")
    labels          = optional(map(string), {})
    metric_relabel_configs = optional(list(object({
      action        = string
      source_labels = optional(list(string), [])
      regex         = optional(string)
      target_label  = optional(string)
      replacement   = optional(string)
      separator     = optional(string)
    })), [])
  }))
}

variable "RESOURCE_ATTRIBUTES" {
  description = "Additional OpenTelemetry resource attributes to upsert before export."
  type        = map(string)
  default     = {}
}

variable "LABELS" {
  description = "Additional Kubernetes labels for collector resources."
  type        = map(string)
  default     = {}
}

variable "IMAGE" {
  description = "OpenTelemetry Collector image."
  type        = string
  default     = "otel/opentelemetry-collector-contrib:0.154.0"
}

variable "REPLICAS" {
  description = "Collector replica count."
  type        = number
  default     = 1
}

variable "NODE_SELECTOR" {
  description = "Node selector applied to collector pods."
  type        = map(string)
  default     = {}
}

variable "RESOURCES" {
  description = "Resource requests and limits for collector pods."
  type = object({
    requests = map(string)
    limits   = map(string)
  })
  default = {
    requests = {
      cpu    = "50m"
      memory = "128Mi"
    }
    limits = {
      cpu    = "200m"
      memory = "256Mi"
    }
  }
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
