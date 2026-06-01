variable "gcp_project_id" {
  description = "GCP project id"
  type        = string
  default     = "testnet-440309"
}

variable "gcp_region" {
  description = "GCP region"
  type        = string
  default     = "us-west1"
}

variable "k8s_cluster_context" {
  description = "GKE cluster context"
  type        = string
  default     = "gke_testnet-440309_us-west1-a_aztec-gke-public"
}

variable "namespace" {
  description = "The Kubernetes namespace to deploy into"
  type        = string
}

variable "chain" {
  description = "Ethereum chain to sync (sepolia or mainnet)"
  type        = string
  validation {
    condition     = contains(["sepolia", "mainnet"], var.chain)
    error_message = "Chain must be either 'sepolia' or 'mainnet'."
  }
}

variable "checkpoint_sync_url" {
  description = "Checkpoint sync URL for Lighthouse"
  type        = string
}

variable "reth_p2p_port" {
  description = "P2P node port for Reth"
  type        = number
}

variable "lighthouse_p2p_port" {
  description = "P2P node port for Lighthouse"
  type        = number
}

variable "reth_image" {
  description = "Reth Docker image"
  type        = string
  default     = "ghcr.io/paradigmxyz/reth:v2.2.0"
}

variable "reth_chart_version" {
  description = "Reth Helm chart version"
  type        = string
  default     = "0.1.6"
}

variable "reth_storage" {
  description = "Lighthouse Helm chart version"
  type        = string
  default     = "4Ti"
}

variable "reth_cpu_request" {
  description = "Reth CPU requests"
  type        = string
  default     = "2"
}

variable "reth_cpu_limit" {
  description = "Reth CPU limit"
  type        = string
  default     = "4"
}

variable "reth_memory_request" {
  description = "Reth RAM requests"
  type        = string
  default     = "16Gi"
}

variable "reth_memory_limit" {
  description = "Reth RAM limit"
  type        = string
  default     = "32Gi"
}

variable "lighthouse_image" {
  description = "Lighthouse Docker image"
  type        = string
  default     = "sigp/lighthouse:v8.1.3"
}

variable "lighthouse_chart_version" {
  description = "Lighthouse Helm chart version"
  type        = string
  default     = "1.1.8"
}

variable "lighthouse_storage" {
  description = "Lighthouse Helm chart version"
  type        = string
  default     = "1Ti"
}

variable "lighthouse_cpu_request" {
  description = "Lighthouse CPU requests"
  type        = string
  default     = "2"
}

variable "lighthouse_cpu_limit" {
  description = "Lighthouse CPU limit"
  type        = string
  default     = "4"
}

variable "lighthouse_memory_request" {
  description = "Lighthouse RAM requests"
  type        = string
  default     = "16Gi"
}

variable "lighthouse_memory_limit" {
  description = "Lighthouse RAM limit"
  type        = string
  default     = "32Gi"
}
