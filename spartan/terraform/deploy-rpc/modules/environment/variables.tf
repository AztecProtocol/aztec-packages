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

variable "CONSUMERS" {
  description = "Kong consumers keyed by team name. Configured consumers can use every keyed RPC route in the environment."
  type = map(object({
    username                       = string
    gcp_secret_manager_secret_name = string
    rate_limit_minute              = number
  }))
  default = {}
}
