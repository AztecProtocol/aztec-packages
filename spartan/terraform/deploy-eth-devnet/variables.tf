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

variable "K8S_CLUSTER_CONTEXT" {
  description = "K8S cluster context"
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

variable "MNEMONIC" {
  description = "The mnemonic to use for the eth devnet"
  type        = string
  default     = "test test test test test test test test test test test junk"
  sensitive   = true
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


variable "PREFUNDED_MNEMONIC_INDICES" {
  description = "Comma-separated list of mnemonic indices to prefund with ETH"
  type        = string
  default     = "0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,1000,1001,1002,1003"
}

variable "RESOURCE_PROFILE" {
  description = "Resource profile to use (dev or prod)"
  type        = string
  default     = "prod"
  validation {
    condition     = contains(["dev", "prod"], var.RESOURCE_PROFILE)
    error_message = "RESOURCE_PROFILE must be either 'dev' or 'prod'."
  }
}

