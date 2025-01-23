variable "GKE_CLUSTER_CONTEXT" {
  description = "GKE cluster context"
  type        = string
  default     = "gke_testnet-440309_us-east4-a_spartan-gke"
}

variable "RELEASE_NAME" {
  description = "Name of helm deployment and k8s namespace"
  type        = string
}

variable "VALUES_FILE" {
  description = "Name of the values file to use for deployment"
  type        = string
}
