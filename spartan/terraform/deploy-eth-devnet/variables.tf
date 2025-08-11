variable "project" {
  description = "GCP project id"
  type        = string
  default     = "testnet-440309"
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-west1"
}

variable "GKE_CLUSTER_CONTEXT" {
  description = "GKE cluster context"
  type        = string
  default     = "gke_testnet-440309_us-west1-a_aztec-gke-private"
}

variable "RELEASE_PREFIX" {
  description = "The prefix to use for the helm install and static IP resources"
  type        = string
  default     = "eth-devnet"
}

variable "NAMESPACE" {
  description = "The namespace to install into"
  type        = string
  default     = "eth-devnet"
}

variable "ETH_DEVNET_VALUES" {
  description = "The values file to apply for eth-devnet"
  type        = string
  default     = "eth-devnet.yaml"
}

variable "CHAIN_ID" {
  description = "Ethereum chain ID"
  type        = number
  default     = 1337
}

variable "BLOCK_TIME" {
  description = "Block time in seconds"
  type        = number
  default     = 12
}

variable "GAS_LIMIT" {
  description = "Gas limit for blocks"
  type        = string
  default     = "1000000000"
}

variable "MNEMONIC_SECRET_NAME" {
  description = "Name of the Google Secret Manager secret containing the mnemonic"
  type        = string
  default     = "eth-devnet-genesis-mnemonic"
}

variable "PREFUNDED_MNEMONIC_INDICES" {
  description = "Comma-separated list of mnemonic indices to prefund with ETH"
  type        = string
  default     = "0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,1000,1001,1002,1003"
}

