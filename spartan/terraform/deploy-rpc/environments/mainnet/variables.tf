variable "GCP_PROJECT_ID" {
  description = "GCP project id for regional RPC infrastructure."
  type        = string
  default     = "testnet-440309"
}

variable "GCP_REGION" {
  description = "GCP region for regional RPC infrastructure."
  type        = string
  default     = "us-west1"
}

variable "K8S_CLUSTER_CONTEXT" {
  description = "Kubernetes context for the GKE cluster."
  type        = string
  default     = "gke_testnet-440309_us-west1-a_aztec-gke-public"
}

variable "V4_AZTEC_DOCKER_IMAGE" {
  description = "Aztec Docker image to deploy for the v4 RPC."
  type        = string
}

variable "CANONICAL_AZTEC_DOCKER_IMAGE" {
  description = "Aztec Docker image to deploy for the canonical RPC once that route is enabled."
  type        = string
}
