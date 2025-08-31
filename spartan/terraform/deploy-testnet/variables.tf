variable "GCP_PROJECT_ID" {
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
  default     = "testnet"
}

variable "NAMESPACE" {
  description = "The namespace to install into"
  type        = string
  default     = "testnet"
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
  default     = "testnet-validator.yaml"
}

variable "ARCHIVE_NODE_VALUES" {
  description = "The values file to apply"
  type        = string
  default     = "testnet-archive-node.yaml"
}

variable "BOT_VALUES" {
  description = "The values file to apply"
  type        = string
  default     = "testnet-bot.yaml"
}

variable "PROVER_VALUES" {
  description = "The values file to apply"
  type        = string
  default     = "testnet-prover.yaml"
}

variable "NODE_RPC_VALUES" {
  description = "The values file to apply"
  type        = string
  default     = "testnet-rpc-node.yaml"
}

variable "SNAPSHOT_VALUES" {
  description = "The values file to apply"
  type        = string
  default     = "testnet-snapshots.yaml"
}

variable "RPC_HOSTNAME" {
  description = "The public hostname for the ingress"
  type        = string
  default     = "rpc.testnet.aztec.network"
}
