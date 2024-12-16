variable "GKE_CLUSTER_CONTEXT" {
  description = "GKE cluster context"
  type        = string
  default     = "gke_testnet-440309_us-west1-a_aztec-gke"
}

variable "RELEASE_NAME" {
  description = "Name of helm deployment and k8s namespace"
  type        = string
}

variable "VALUES_FILE" {
  description = "Name of the values file to use for deployment"
  type        = string
}

variable "AZTEC_DOCKER_IMAGE" {
  description = "Docker image to use for the aztec network"
  type        = string
}

variable "L1_DEPLOYMENT_MNEMONIC" {
  description = "Mnemonic to use for the L1 contract deployments"
  type        = string
  sensitive   = true
}

variable "L1_DEPLOYMENT_PRIVATE_KEY" {
  description = "Private key to use for the L1 contract deployments"
  type        = string
  sensitive   = true
}

variable "VALIDATOR_KEYS" {
  description = "List of private keys to use for the validators"
  type        = list(string)
  sensitive   = true
  default     = []
}

variable "BOOT_NODE_SEQ_PUBLISHER_PRIVATE_KEY" {
  description = "Private key to use for the boot node"
  type        = string
  sensitive   = true
}

variable "PROVER_PUBLISHER_PRIVATE_KEY" {
  description = "Private key to use for the prover"
  type        = string
  sensitive   = true
}

variable "ETHEREUM_EXTERNAL_HOST" {
  description = "External host to use for the ethereum node"
  type        = string
}
variable "L1_DEPLOYMENT_SALT" {
  description = "Salt to use for the L1 contract deployments"
  type        = string
  default     = ""
}
