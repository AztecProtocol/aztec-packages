variable "GCP_PROJECT" {
  description = "GCP project id"
  type        = string
  default     = "testnet-440309"
}

variable "GCP_REGION" {
  default = "us-west1"
  type    = string
}

variable "GKE_CLUSTER_CONTEXT" {
  description = "GKE cluster context"
  type        = string
  default     = "gke_testnet-440309_us-west1-a_aztec-gke-public"
}

variable "RELEASE_PREFIX" {
  description = "The prefix to use for the helm installs"
  type        = string
  default     = "staging-testnet"
}

variable "NAMESPACE" {
  description = "The namespace to install into"
  type        = string
  default     = "staging-testnet"
}

variable "AZTEC_DOCKER_IMAGE" {
  description = "Docker image to use for the aztec network"
  type        = string
  default     = "aztecprotocol/aztec:staging"
}

variable "METRICS_NAMESPACE" {
  description = "Namespace to deploy the metrics to"
  type        = string
  default     = "metrics"
}

variable "VALIDATOR_VALUES" {
  description = "The values file to apply"
  type        = string
  default     = "staging-testnet-validator.yaml"
}

variable "PROVER_VALUES" {
  description = "The values file to apply"
  type        = string
  default     = "staging-testnet-prover.yaml"
}

variable "RPC_VALUES" {
  description = "The values file to apply"
  type        = string
  default     = "staging-testnet-rpc.yaml"
}

