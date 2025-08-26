variable "NAMESPACE" {
  description = "The namespace to deploy the signer into"
  type        = string
}

variable "RELEASE_NAME" {
  description = "The name of the release"
  type        = string
  default     = "signer"
}

variable "CHAIN_ID" {
  description = "The chain ID of the target network"
  type        = string
}

# TODO: switch to passing mnemonic by secret name (instead of value)
# mount secret directly into pod through secret store CSI driver
# https://cloud.google.com/secret-manager/docs/secret-manager-managed-csi-component
variable "MNEMONIC" {
  description = "The mnemonic to use for this deployment"
  type        = string
  sensitive   = true
}

variable "ADDRESS_CONFIGMAP_NAME" {
  description = "Name of the ConfigMap where the addresses will be published"
  type        = string
}

variable "ATTESTERS_PER_NODE" {
  description = "Number of attester keys to derive"
  type        = number
}

variable "NODE_COUNT" {
  description = "Number of attester keys to derive"
  type        = number
}

variable "MNEMONIC_INDEX_START" {
  description = "Mnemonic index start for key derivation"
  type        = number
}

variable "AZTEC_DOCKER_IMAGE" {
  description = "The Aztec image to deploy"
  type        = string
  default     = "aztecprotocol/aztec:latest"
}

variable "WEB3SIGNER_DOCKER_IMAGE" {
  description = "The web3signer image to use"
  type        = string
  default     = "consensys/web3signer:25.3.0"
}

variable "KUBECTL_DOCKER_IMAGE" {
  description = "The kubectl image to use"
  type        = string
  default     = "bitnami/kubectl:1.33.4"
}
