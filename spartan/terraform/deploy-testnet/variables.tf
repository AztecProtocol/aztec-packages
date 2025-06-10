variable "GCP_PROJECT" {
  description = "GCP project id"
  type        = string
  default     = "testnet-440309"
}

variable "GCP_REGION" {
  default = "us-west1"
  type    = string
}

variable "GCP_BLOCKCHAIN_NODE_ID" {
  default = "eth-sepolia-node-2"
  type    = string
}

variable "GCP_BLOCKCHAIN_NODE_REGION" {
  default = "us-central1"
  type    = string
}

variable "GKE_CLUSTER_CONTEXT" {
  description = "GKE cluster context"
  type        = string
  default     = "gke_testnet-440309_us-west1-a_aztec-gke-private"
}

variable "RELEASE_PREFIX" {
  description = "The prefix to use for the helm installs"
  type        = string
  default     = "alpha-testnet"
}

variable "NAMESPACE" {
  description = "The namespace to install into"
  type        = string
  default     = "alpha-testnet"
}

variable "AZTEC_DOCKER_IMAGE" {
  description = "Docker image to use for the aztec network"
  type        = string
  default     = "aztecprotocol/aztec:latest"
}

variable "METRICS_NAMESPACE" {
  description = "Namespace to deploy the metrics to"
  type        = string
  default     = "metrics"
}

variable "VALIDATOR_VALUES" {
  description = "The values file to apply"
  type        = string
  default     = "alpha-testnet-validator.yaml"
}

variable "PROVER_VALUES" {
  description = "The values file to apply"
  type        = string
  default     = "alpha-testnet-prover.yaml"
}
