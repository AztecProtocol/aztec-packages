variable "GKE_CLUSTER_CONTEXT" {
  description = "GKE cluster context"
  type        = string
  default     = "gke_testnet-440309_us-west1-a_aztec-gke-private"
}

variable "RELEASE_NAME" {
  description = "Name of helm deployment and k8s namespace"
  type        = string
}

variable "VALUES_FILE" {
  description = "Name of the values file to use for deployment"
  type        = string
}

# In google cloud we run with a beefier resources file
variable "RESOURCES_FILE" {
  description = "Name of the resources file to use for deployment"
  type        = string
  default     = "gcloud.yaml"
}

variable "AZTEC_DOCKER_IMAGE" {
  description = "Docker image to use for the aztec network"
  type        = string
}

variable "L1_DEPLOYMENT_MNEMONIC" {
  description = "Mnemonic to use for the L1 contract deployments"
  type        = string
  sensitive   = true
  default     = ""
}

variable "L1_DEPLOYMENT_PRIVATE_KEY" {
  description = "Private key to use for the L1 contract deployments"
  type        = string
  sensitive   = true
  default     = ""
}

variable "EXTERNAL_ETHEREUM_HOSTS" {
  description = "External host to use for the ethereum node"
  type        = string
  default     = ""
}

variable "EXTERNAL_ETHEREUM_CONSENSUS_HOST" {
  description = "External host to use for the ethereum consensus node"
  type        = string
  default     = ""
}

variable "EXTERNAL_ETHEREUM_CONSENSUS_HOST_API_KEY" {
  description = "API key to use for the ethereum consensus node"
  type        = string
  default     = ""
}

variable "EXTERNAL_ETHEREUM_CONSENSUS_HOST_API_KEY_HEADER" {
  description = "API key header to use for the ethereum consensus node"
  type        = string
  default     = ""
}

variable "L1_DEPLOYMENT_SALT" {
  description = "Salt to use for the L1 contract deployments"
  type        = string
  default     = ""
}

variable "EXPOSE_HTTPS_BOOTNODE" {
  description = "Whether to expose the bootnode with HTTPS"
  type        = bool
  default     = false
}

variable "BOOTNODE_IP_REGION" {
  default = "us-west1"
  type    = string
}

variable "METRICS_NAMESPACE" {
  description = "Namespace to deploy the metrics to"
  type        = string
  default     = "metrics"
}
