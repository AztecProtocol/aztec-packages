variable "project" {
  description = "GCP project ID"
  type        = string
  default     = "testnet-440309"
}

variable "jwt_secret_name" {
  description = "GCP Secret Manager secret name for JWT"
  type        = string
  default     = "eth-mainnet-jwt"
}

variable "jwt_secret_version" {
  description = "Secret version"
  type        = string
  default     = "latest"
}

variable "NAMESPACE" {
  description = "Kubernetes namespace to deploy into"
  type        = string
  default     = "eth-mainnet"
}

variable "RELEASE_PREFIX" {
  description = "The prefix to use for the helm install and static IP resources"
  type        = string
  default     = "eth-mainnet"
}

variable "L1_CHECKPOINT_SYNC_URL" {
  description = "Beacon checkpoint sync URL (optional)"
  type        = string
  default     = "https://sync-mainnet.beaconcha.in"
}

variable "K8S_CLUSTER_CONTEXT" {
  description = "kubectl context name for the target cluster"
  type        = string
  default     = "gke_testnet-440309_us-west1-a_aztec-gke-private"
}

variable "ETH_MAINNET_VALUES" {
  description = "The values file to apply for eth-mainnet"
  type        = string
  default     = "eth-mainnet.yaml"
}

variable "RESOURCE_PROFILE" {
  description = "Resource profile to use (dev or prod)"
  type        = string
  default     = "prod"
}
