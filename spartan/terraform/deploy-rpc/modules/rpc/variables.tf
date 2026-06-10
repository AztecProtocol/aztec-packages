variable "NAMESPACE" {
  description = "Kubernetes namespace to deploy the RPC workload into."
  type        = string
}

variable "RELEASE_NAME" {
  description = "Helm release name for this RPC instance."
  type        = string
}

variable "RELEASE_PREFIX" {
  description = "Prefix used for generated RPC gateway resources."
  type        = string
}

variable "AZTEC_DOCKER_IMAGE" {
  description = "Aztec Docker image in repository:tag form."
  type        = string

  validation {
    condition     = can(regex("^.+:.+$", var.AZTEC_DOCKER_IMAGE))
    error_message = "AZTEC_DOCKER_IMAGE must be in repository:tag form, for example aztecprotocol/aztec:latest."
  }
}

variable "ENV" {
  description = "Environment variables for the RPC node."
  type        = map(string)
}

variable "L1_RPC_SECRET_NAME" {
  description = "GCP Secret Manager secret containing the JSON array of L1 execution RPC URLs."
  type        = string
}

variable "L1_CONSENSUS_HOST_URLS_SECRET_NAME" {
  description = "GCP Secret Manager secret containing the JSON array of L1 consensus host URLs."
  type        = string
}

variable "L1_CONSENSUS_HOST_API_KEYS_SECRET_NAME" {
  description = "GCP Secret Manager secret containing the JSON array of L1 consensus host API keys."
  type        = string
}

variable "L1_CONSENSUS_HOST_API_KEY_HEADERS_SECRET_NAME" {
  description = "GCP Secret Manager secret containing the JSON array of L1 consensus host API key headers."
  type        = string
}

variable "STORAGE_SIZE" {
  description = "Persistent volume size per RPC pod."
  type        = string
}

variable "OTEL_COLLECTOR_ENDPOINT_GCP_SECRET_NAME" {
  description = "GCP Secret Manager secret containing the OpenTelemetry collector base URL."
  type        = string
  default     = "otel-collector-url"
}
