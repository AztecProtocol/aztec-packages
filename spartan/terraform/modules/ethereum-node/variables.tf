variable "NAMESPACE" {
  description = "Kubernetes namespace to deploy into."
  type        = string
}

variable "RELEASE_PREFIX" {
  description = "Prefix used for Reth and Lighthouse Helm release names."
  type        = string
}

variable "CHAIN" {
  description = "Ethereum chain to sync."
  type        = string

  validation {
    condition     = contains(["sepolia", "mainnet"], var.CHAIN)
    error_message = "CHAIN must be either sepolia or mainnet."
  }
}

variable "CHECKPOINT_SYNC_URL" {
  description = "Checkpoint sync URL for Lighthouse."
  type        = string
}

variable "ETHEREUM_HELM_REPOSITORY" {
  description = "Helm repository containing the Reth and Lighthouse charts."
  type        = string
  default     = "https://ethpandaops.github.io/ethereum-helm-charts"
}

variable "IMAGE_PULL_POLICY" {
  description = "Image pull policy for Reth and Lighthouse."
  type        = string
  default     = "Always"
}

variable "NODE_SELECTOR" {
  description = "Node selector applied to Reth and Lighthouse pods."
  type        = map(string)
  default = {
    node-type = "infra"
  }
}

variable "STORAGE_CLASS_NAME" {
  description = "Storage class for Reth and Lighthouse PVCs."
  type        = string
  default     = "premium-rwo"
}

variable "INTERNAL_TRAFFIC_POLICY" {
  description = "Service internalTrafficPolicy value. Empty string leaves the chart default."
  type        = string
  default     = ""
}

variable "HELM_TIMEOUT_SECONDS" {
  description = "Helm release timeout in seconds."
  type        = number
  default     = 600
}

variable "HELM_WAIT" {
  description = "Whether Helm should wait for Kubernetes resources to become ready."
  type        = bool
  default     = false
}

variable "RETH_IMAGE" {
  description = "Reth Docker image, including tag."
  type        = string
  default     = "ghcr.io/paradigmxyz/reth:v2.3.0"

  validation {
    condition     = length(split(":", var.RETH_IMAGE)) > 1
    error_message = "RETH_IMAGE must include an explicit tag."
  }
}

variable "RETH_CHART_VERSION" {
  description = "Reth Helm chart version."
  type        = string
  default     = "0.1.8"
}

variable "RETH_STORAGE" {
  description = "Reth PVC size."
  type        = string
}

variable "RETH_P2P_PORT" {
  description = "Reth P2P NodePort. Must not collide with legacy nodes while both stacks run."
  type        = number
}

variable "RETH_INTERNAL_LOAD_BALANCER" {
  description = "Reth direct-access internal LoadBalancer config. Null disables the Service."
  type = object({
    ip = string
  })
  default = null
}

variable "RETH_RESOURCES" {
  description = "Reth resource requests and limits."
  type = object({
    requests = object({
      cpu    = string
      memory = string
    })
    limits = object({
      cpu    = string
      memory = string
    })
  })
}

variable "RETH_EXTRA_ARGS" {
  description = "Additional Reth arguments appended after module-managed arguments."
  type        = list(string)
  default     = []
}

variable "RETH_FILE_LOGGING_ENABLED" {
  description = "Whether Reth writes rotated log files into the data volume in addition to stdout."
  type        = bool
  default     = false
}

variable "LIGHTHOUSE_IMAGE" {
  description = "Lighthouse Docker image, including tag."
  type        = string
  default     = "sigp/lighthouse:v8.2.0"

  validation {
    condition     = length(split(":", var.LIGHTHOUSE_IMAGE)) > 1
    error_message = "LIGHTHOUSE_IMAGE must include an explicit tag."
  }
}

variable "LIGHTHOUSE_CHART_VERSION" {
  description = "Lighthouse Helm chart version."
  type        = string
  default     = "1.1.8"
}

variable "LIGHTHOUSE_STORAGE" {
  description = "Lighthouse PVC size."
  type        = string
}

variable "LIGHTHOUSE_P2P_PORT" {
  description = "Lighthouse P2P NodePort. Must not collide with legacy nodes while both stacks run."
  type        = number
}

variable "LIGHTHOUSE_INTERNAL_LOAD_BALANCER" {
  description = "Lighthouse direct-access internal LoadBalancer config. Null disables the Service."
  type = object({
    ip = string
  })
  default = null
}

variable "LIGHTHOUSE_RESOURCES" {
  description = "Lighthouse resource requests and limits."
  type = object({
    requests = object({
      cpu    = string
      memory = string
    })
    limits = object({
      cpu    = string
      memory = string
    })
  })
}

variable "LIGHTHOUSE_EXTRA_ARGS" {
  description = "Additional Lighthouse arguments appended after module-managed arguments."
  type        = list(string)
  default     = []
}
